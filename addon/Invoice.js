/**
 * Invoice generation: selected rows -> HTML template -> PDF in Drive -> write-back to the sheet.
 *
 * Line items: the description cell may hold one item per line as "Item text | 120.00".
 * If any line has an amount, the subtotal is the sum of those lines; otherwise the Amount column is used.
 * Totals: subtotal - discount (column) + tax (row's tax rate column, else the profile's rate).
 *
 * Runs: the sidebar calls prepareInvoiceRun() once (validation, output columns, row list), then
 * generateInvoicesForRows() in small chunks, so large batches show progress and never hit the
 * 6-minute Apps Script execution limit.
 *
 * Concurrency: each row is generated holding the document lock (then the user lock, always in that
 * order), and the row is re-read inside the lock, so double clicks or collaborators can't invoice a
 * row twice or reuse a number. The counter only advances once the PDF is in Drive: no gaps.
 */

var TEMPLATES = ['Classic', 'Modern'];
var MAX_ROWS_PER_RUN = 200;
var ROW_LOCK_WAIT_MS = 30000;
var STATUS_VALUES = ['Unpaid', 'Paid', 'Overdue', 'Void'];

/** Validates everything up front and returns the rows to process. Adds output columns if missing. */
function prepareInvoiceRun(options) {
  var sheet = SpreadsheetApp.getActiveSheet();
  var profile = getProfile();
  if (!profile.businessName) throw new Error('Add your business name in "Business profile" first.');

  var mapping = requireMapping_(sheet);
  var rows = selectedDataRows_(sheet, mapping.headerRow);
  if (rows.length === 0) throw new Error('Select one or more data rows (below the header row).');
  if (rows.length > MAX_ROWS_PER_RUN) {
    throw new Error('Select up to ' + MAX_ROWS_PER_RUN + ' rows at a time.');
  }
  if (options && options.email) assertCanEmail_(mapping);

  // Without write-back columns an invoiced row can't be recognised later, so add them on first run.
  ensureOutputColumns_(sheet, mapping);
  return { sheetId: sheet.getSheetId(), rows: rows };
}

/** Processes one chunk of a run. Stops early (limitReached) when the free plan runs out. */
function generateInvoicesForRows(sheetId, rows, options) {
  var sheet = sheetById_(sheetId);
  var profile = getProfile();
  var mapping = requireMapping_(sheet);
  var context = invoiceContext_(profile);
  var results = [];
  for (var i = 0; i < rows.length; i++) {
    try {
      results.push(generateInvoiceForRow_(sheet, Number(rows[i]), mapping, profile, context, options || {}));
    } catch (err) {
      results.push({ row: rows[i], error: err.message, limitReached: !!err.limitReached });
      if (err.limitReached) break; // every remaining row would fail the same way
    }
  }
  return results;
}

function sheetById_(sheetId) {
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === Number(sheetId)) return sheets[i];
  }
  throw new Error('The sheet being invoiced was deleted.');
}

function requireMapping_(sheet) {
  var mapping = getMapping(sheet);
  assertMappingCurrent_(mapping);
  if (!isMappingComplete_(mapping)) {
    throw new Error('Map at least the "Client name" and "Description" columns first.');
  }
  return mapping;
}

/** Spreadsheet-wide settings computed once per run: time zone, number locale, logo. */
function invoiceContext_(profile) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return {
    timeZone: spreadsheet.getSpreadsheetTimeZone(),
    locale: numberLocale_(spreadsheet.getSpreadsheetLocale()),
    logo: logoDataUri_(profile)
  };
}

function selectedDataRows_(sheet, headerRow) {
  var firstDataRow = (headerRow || 1) + 1;
  var seen = {};
  var rows = [];
  var rangeList = sheet.getActiveRangeList();
  var ranges = rangeList ? rangeList.getRanges() : [sheet.getActiveRange()];
  ranges.forEach(function (range) {
    if (!range) return;
    var last = Math.min(range.getLastRow(), sheet.getLastRow());
    for (var r = Math.max(range.getRow(), firstDataRow); r <= last; r++) {
      if (!seen[r]) {
        seen[r] = true;
        rows.push(r);
      }
    }
  });
  return rows.sort(function (a, b) { return a - b; });
}

function generateInvoiceForRow_(sheet, row, mapping, profile, context, options) {
  var docLock = LockService.getDocumentLock();
  if (!docLock.tryLock(ROW_LOCK_WAIT_MS)) {
    throw new Error('Another invoice is being created in this spreadsheet. Try again in a moment.');
  }
  // The user lock guards the account-wide counter and the usage count.
  var userLock = LockService.getUserLock();
  if (!userLock.tryLock(ROW_LOCK_WAIT_MS)) {
    docLock.releaseLock();
    throw new Error('Another invoice run of yours is still in progress. Try again in a moment.');
  }
  try {
    var data = readRow_(sheet, row, mapping);
    if (data.text('invoiceNumber')) {
      return { row: row, skipped: true, invoiceNumber: data.text('invoiceNumber') };
    }

    var invoiceNumber = peekInvoiceNumber_(profile);
    var invoice = buildInvoice_(data, profile, invoiceNumber, context);
    var usage = checkCanGenerate_();

    var html = renderInvoiceHtml_(invoice, profile, context.logo, usage.plan !== 'pro');
    var pdf = htmlToPdf_(html, invoiceNumber);
    var file = uploadToDrive_(pdf, invoiceNumber + ' - ' + invoice.clientName + '.pdf', getAppFolderId_());
    commitInvoiceNumber_(profile);

    if (mapping.invoiceNumber) sheet.getRange(row, mapping.invoiceNumber).setValue(invoiceNumber);
    if (mapping.status) sheet.getRange(row, mapping.status).setValue('Unpaid');
    if (mapping.pdfLink) {
      sheet.getRange(row, mapping.pdfLink).setRichTextValue(
        SpreadsheetApp.newRichTextValue().setText('Open PDF').setLinkUrl(file.webViewLink).build()
      );
    }
    SpreadsheetApp.flush(); // write-back must land before the locks are released
    recordUsage_();

    var result = { row: row, invoiceNumber: invoiceNumber, url: file.webViewLink };
    if (options.email) {
      // The invoice exists either way; an email failure is reported, not thrown.
      try {
        result.emailedTo = sendInvoiceEmail_(sheet, row, mapping, profile, invoice, pdf, context);
      } catch (err) {
        result.emailError = err.message;
      }
    }
    return result;
  } finally {
    userLock.releaseLock();
    docLock.releaseLock();
  }
}

/** Reads one row. cell() gives raw values (numbers, Dates), text() what the user sees. */
function readRow_(sheet, row, mapping) {
  var range = sheet.getRange(row, 1, 1, Math.max(sheet.getLastColumn(), 1));
  var values = range.getValues()[0];
  var display = range.getDisplayValues()[0];
  var pick = function (arr, key) {
    var v = mapping[key] ? arr[mapping[key] - 1] : '';
    return v === undefined || v === null ? '' : v;
  };
  return {
    row: row,
    cell: function (key) { return pick(values, key); },
    text: function (key) { return String(pick(display, key)).trim(); }
  };
}

/** Builds the template data for a row, validating what an invoice can't do without. */
function buildInvoice_(data, profile, invoiceNumber, context) {
  var clientName = data.text('clientName');
  if (!clientName) throw new Error('Client name is empty.');

  var decimal = context.locale.decimal;
  var money = function (amount) { return formatMoney_(amount, profile.currency, context.locale.tag); };
  var items = parseLineItems_(String(data.cell('description')), data.cell('amount'), decimal);

  var discount = parseAmount_(data.cell('discount'), decimal);
  var totals = computeTotals_(items, isNaN(discount) ? 0 : discount, rowTaxRate_(data, profile, decimal));
  if (!(totals.subtotal > 0)) throw new Error('No amount found. Fill the Amount column or use "Item | 120" lines.');

  var dueDate = data.cell('dueDate');
  return {
    number: invoiceNumber,
    issueDate: Utilities.formatDate(new Date(), context.timeZone, 'MMM d, yyyy'),
    dueDate: dueDate instanceof Date ? Utilities.formatDate(dueDate, context.timeZone, 'MMM d, yyyy') : data.text('dueDate'),
    clientName: clientName,
    clientEmail: data.text('clientEmail'),
    clientAddress: data.text('clientAddress'),
    notes: data.text('notes'),
    items: items.map(function (item) {
      return { description: item.description, amountText: item.amount === null ? '' : money(item.amount) };
    }),
    showSubtotal: totals.discount > 0 || totals.taxRate > 0,
    subtotalText: money(totals.subtotal),
    discountText: totals.discount > 0 ? '-' + money(totals.discount) : '',
    taxLabel: totals.taxRate > 0 ? (profile.taxLabel || 'Tax') + ' (' + totals.taxRate + '%)' : '',
    taxText: totals.taxRate > 0 ? money(totals.tax) : '',
    totalText: money(totals.total)
  };
}

/** The row's tax rate column wins over the profile rate. Percent-formatted cells hold fractions. */
function rowTaxRate_(data, profile, decimal) {
  var text = data.text('taxRate');
  if (text === '') return profile.taxRate === '' ? 0 : Number(profile.taxRate);
  var raw = data.cell('taxRate');
  var rate = typeof raw === 'number' && text.indexOf('%') !== -1 ? roundTo_(raw * 100, 4) : parsePercent_(raw, decimal);
  if (isNaN(rate) || rate < 0 || rate > 100) throw new Error('Tax rate "' + text + '" is not a percentage between 0 and 100.');
  return rate;
}

function parseLineItems_(description, amountCell, decimalSeparator) {
  var lines = description.split(/\r?\n/)
    .map(function (line) { return line.trim(); })
    .filter(Boolean);

  var hasLineAmounts = false;
  var items = lines.map(function (line) {
    var match = line.match(/^(.*\S)\s*\|\s*([^|]+)$/);
    var amount = match ? parseAmount_(match[2], decimalSeparator) : NaN;
    if (!isNaN(amount)) {
      hasLineAmounts = true;
      return { description: match[1], amount: amount };
    }
    return { description: line, amount: null };
  });

  if (hasLineAmounts) return items;

  var amount = parseAmount_(amountCell, decimalSeparator);
  return [{ description: lines.join('\n') || 'Services', amount: isNaN(amount) ? null : amount }];
}

/**
 * Invoice counter, per spreadsheet (DocumentProperties) or per Google account (UserProperties).
 * Callers must hold the document and user locks between peek and commit.
 */
function counterStore_(profile) {
  if (profile.numbering !== 'account') return PropertiesService.getDocumentProperties();
  var userProps = PropertiesService.getUserProperties();
  if (userProps.getProperty('invoiceCounter') === null) {
    // Switching to account-wide numbering: continue from this spreadsheet's count instead of 1.
    var docCount = PropertiesService.getDocumentProperties().getProperty('invoiceCounter');
    userProps.setProperty('invoiceCounter', docCount || '0');
  }
  return userProps;
}

function peekInvoiceNumber_(profile) {
  var next = Number(counterStore_(profile).getProperty('invoiceCounter') || 0) + 1;
  return (profile.prefix || '') + String(next).padStart(4, '0');
}

function commitInvoiceNumber_(profile) {
  var props = counterStore_(profile);
  props.setProperty('invoiceCounter', String(Number(props.getProperty('invoiceCounter') || 0) + 1));
}

function renderInvoiceHtml_(invoice, profile, logo, showFooter) {
  var template = HtmlService.createTemplateFromFile('templates/' + profile.template);
  template.invoice = invoice;
  template.profile = profile;
  template.logo = logo;
  template.showFooter = showFooter;
  return template.evaluate().getContent();
}

function htmlToPdf_(html, invoiceNumber) {
  return Utilities.newBlob(html, MimeType.HTML, invoiceNumber + '.html')
    .getAs(MimeType.PDF)
    .setName(invoiceNumber + '.pdf');
}

function logoDataUri_(profile) {
  if (!profile.logoFileId) return '';
  try {
    var blob = downloadFromDrive_(profile.logoFileId);
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (err) {
    return '';
  }
}

/** Template helper: escape text and keep line breaks. Use with <?!= ?>. */
function nl2br_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

/* ---------- Email ---------- */

var EMAIL_PATTERN = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

function assertCanEmail_(mapping) {
  if (!getUsage().canEmail) throw new Error('Emailing invoices is a Pro feature. Upgrade to send invoices from Sheets.');
  if (!mapping.clientEmail) throw new Error('Map the "Client email" column to email invoices.');
}

/** Sends the invoice PDF from the user's Gmail. Returns the recipient; throws on any problem. */
function sendInvoiceEmail_(sheet, row, mapping, profile, invoice, pdf, context) {
  var to = invoice.clientEmail;
  if (!EMAIL_PATTERN.test(to)) throw new Error(to ? 'Client email "' + to + '" looks invalid.' : 'Client email is empty.');
  if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Daily Gmail sending limit reached. Try again tomorrow.');

  var values = {
    client: invoice.clientName,
    number: invoice.number,
    total: invoice.totalText,
    dueDate: invoice.dueDate || 'on receipt',
    business: profile.businessName
  };
  var message = {
    to: to,
    subject: fillPlaceholders_(profile.emailSubject, values),
    body: fillPlaceholders_(profile.emailMessage, values),
    name: profile.businessName,
    attachments: [pdf]
  };
  if (EMAIL_PATTERN.test(profile.businessEmail)) message.replyTo = profile.businessEmail;
  MailApp.sendEmail(message);

  if (mapping.status) {
    var cell = sheet.getRange(row, mapping.status);
    var stamp = Utilities.formatDate(new Date(), context.timeZone, 'MMM d, yyyy HH:mm');
    cell.setNote(((cell.getNote() ? cell.getNote() + '\n' : '') + 'Emailed to ' + to + ' on ' + stamp).slice(-2000));
  }
  return to;
}

/** Sidebar "Email selected": (re)sends already-created invoices using their PDF in Drive. */
function emailSelectedInvoices() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var profile = getProfile();
  var mapping = requireMapping_(sheet);
  assertCanEmail_(mapping);
  if (!mapping.pdfLink) throw new Error('Map the "PDF link" column to email existing invoices.');
  var rows = selectedDataRows_(sheet, mapping.headerRow);
  if (rows.length === 0) throw new Error('Select the invoiced rows to email.');
  if (rows.length > 50) throw new Error('Select up to 50 rows to email at a time.');

  var context = invoiceContext_(profile);
  return rows.map(function (row) {
    try {
      var data = readRow_(sheet, row, mapping);
      var number = data.text('invoiceNumber');
      if (!number) return { row: row, error: 'Not invoiced yet. Create the invoice first.' };
      var rich = sheet.getRange(row, mapping.pdfLink).getRichTextValue();
      var fileId = driveFileIdFromUrl_(rich ? rich.getLinkUrl() : '');
      if (!fileId) return { row: row, error: 'No PDF link found in the row.' };
      var pdf = downloadFromDrive_(fileId).setName(number + '.pdf');
      var invoice = buildInvoice_(data, profile, number, context);
      return { row: row, invoiceNumber: number, emailedTo: sendInvoiceEmail_(sheet, row, mapping, profile, invoice, pdf, context) };
    } catch (err) {
      return { row: row, error: err.message };
    }
  });
}

function driveFileIdFromUrl_(url) {
  var match = /\/d\/([\w-]{20,})/.exec(url || '') || /[?&]id=([\w-]{20,})/.exec(url || '');
  return match ? match[1] : '';
}

/* ---------- Status ---------- */

/** Sidebar "Mark Paid" (or any STATUS_VALUES entry) for the selected, already-invoiced rows. */
function markSelectedStatus(status) {
  if (STATUS_VALUES.indexOf(status) === -1) throw new Error('Unknown status: ' + status);
  var sheet = SpreadsheetApp.getActiveSheet();
  var mapping = requireMapping_(sheet);
  if (!mapping.status || !mapping.invoiceNumber) throw new Error('Map the "Status" and "Invoice #" columns first.');
  var rows = selectedDataRows_(sheet, mapping.headerRow);
  if (rows.length === 0) throw new Error('Select the invoiced rows to update.');

  var updated = 0;
  var skipped = 0;
  rows.forEach(function (row) {
    if (!String(sheet.getRange(row, mapping.invoiceNumber).getDisplayValue()).trim()) {
      skipped++;
      return;
    }
    sheet.getRange(row, mapping.status).setValue(status);
    updated++;
  });
  return { status: status, updated: updated, skipped: skipped };
}

/* ---------- Preview ---------- */

/**
 * Opens a modal with the invoice exactly as it would render for the first selected row.
 * No PDF, no Drive file, no usage, no invoice number consumed.
 */
function showInvoicePreview() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var mapping = requireMapping_(sheet);
  var rows = selectedDataRows_(sheet, mapping.headerRow);
  if (rows.length === 0) throw new Error('Select a data row to preview.');

  var row = rows[0];
  var profile = getProfile();
  var data = readRow_(sheet, row, mapping);
  var existingNumber = data.text('invoiceNumber');
  var shownProfile = Object.assign({}, profile, { businessName: profile.businessName || 'Your business name' });
  var invoice = buildInvoice_(data, shownProfile, existingNumber || peekInvoiceNumber_(profile), invoiceContext_(profile));
  var html = renderInvoiceHtml_(invoice, shownProfile, logoDataUri_(profile), getUsage().plan !== 'pro');

  var note = existingNumber
    ? 'Row ' + row + ' was already invoiced as ' + existingNumber + '. Creating again will skip it.'
    : 'Preview of row ' + row + '. Nothing is saved until you click Create.';
  if (!profile.businessName) note += ' Add your business name in the sidebar first.';

  var bar =
    '<div style="position:sticky;top:0;z-index:10;display:flex;gap:12px;align-items:center;' +
    'justify-content:space-between;background:#fef7e0;color:#3c2a00;border-bottom:1px solid #f0d68a;' +
    'padding:8px 14px;font:13px Arial,sans-serif;">' +
    '<span>' + nl2br_(note) + '</span>' +
    '<button onclick="google.script.host.close()" style="font:inherit;padding:4px 12px;cursor:pointer;">Close</button>' +
    '</div>';
  var output = HtmlService.createHtmlOutput(html.replace('<body>', '<body>' + bar))
    .setWidth(860)
    .setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(output, 'Invoice preview');

  return { row: row, itemCount: invoice.items.length, totalText: invoice.totalText };
}
