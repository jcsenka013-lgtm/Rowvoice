/**
 * Column mapping: which sheet column holds which invoice field.
 * Stored per sheet (by sheet ID) in DocumentProperties as
 *   { headerRow, clientName: 1, ..., headerNames: { clientName: 'Client', ... } }.
 * Column values are 1-based column numbers.
 *
 * Header names are stored next to column numbers, so inserting, deleting or moving columns doesn't
 * make invoices read (or write back to) the wrong column: getMapping() re-finds a moved header,
 * and reports fields whose header disappeared or was renamed as `missing`.
 *
 * When nothing is stored for a sheet, the mapping is detected on the fly: the header row is the
 * best-scoring row among the first HEADER_SCAN_ROWS, and columns are fuzzy-matched by header text.
 * A detected mapping carries `auto: true` and is only persisted once the user saves it, adds output
 * columns, or creates an invoice.
 */

var MAPPING_FIELDS = [
  { key: 'clientName', label: 'Client name', required: true },
  { key: 'clientEmail', label: 'Client email' },
  { key: 'clientAddress', label: 'Client address' },
  { key: 'description', label: 'Description / line items', required: true },
  { key: 'amount', label: 'Amount' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'discount', label: 'Discount (amount)' },
  { key: 'taxRate', label: 'Tax rate % (overrides profile)' },
  { key: 'notes', label: 'Notes' },
  { key: 'invoiceNumber', label: 'Invoice # (written back)', output: true },
  { key: 'status', label: 'Status (written back)', output: true },
  { key: 'pdfLink', label: 'PDF link (written back)', output: true }
];

var OUTPUT_HEADERS = { invoiceNumber: 'Invoice #', status: 'Status', pdfLink: 'Invoice PDF' };

var HEADER_SCAN_ROWS = 10;

/**
 * Header synonyms, strongest first. A leading "=" means exact match only: generic words like
 * "name" shouldn't claim "Project name". Output fields only ever match exactly, so a column like
 * "Invoice date" is never mistaken for the invoice number column and overwritten.
 */
var HEADER_SYNONYMS = {
  clientName: ['client', 'client name', 'customer', 'customer name', 'company', 'company name',
    'bill to', 'billed to', 'business name', 'account', '=name', '=payer'],
  clientEmail: ['client email', 'customer email', 'email', 'e mail', 'email address', 'contact email',
    'billing email', '=mail'],
  clientAddress: ['client address', 'customer address', 'billing address', 'address', '=location'],
  description: ['description', 'line items', 'services', 'service', 'items', 'details', 'product',
    'products', '=item', '=work', '=task', '=project', '=job'],
  amount: ['amount', 'total', 'amount due', 'total due', 'price', 'cost', 'fee', 'fees', 'invoice amount',
    'subtotal', 'charge', 'rate', '=value', '=balance', '=usd', '=eur', '=gbp'],
  dueDate: ['due date', 'payment due', 'due on', 'pay by', 'deadline', '=due'],
  discount: ['discount', 'discount amount', '=disc', '=rebate'],
  taxRate: ['tax rate', 'vat rate', 'gst rate', 'sales tax rate', '=tax %', '=vat %', '=gst %'],
  notes: ['invoice notes', 'notes', 'comments', '=note', '=memo', '=remarks'],
  invoiceNumber: ['=invoice #', '=invoice number', '=invoice no', '=inv #', '=invoice id', '=invoice'],
  status: ['=status', '=payment status', '=invoice status'],
  pdfLink: ['=invoice pdf', '=pdf', '=pdf link', '=invoice link', '=link']
};

function normalizeHeader_(value) {
  return String(value === null || value === undefined ? '' : value)
    .toLowerCase()
    .replace(/#/g, ' # ')
    .replace(/%/g, ' % ')
    .replace(/[^a-z0-9#%]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Score how well a header matches a field: 100+ exact, 50+ contains the synonym's words, 0 none. */
function headerScore_(fieldKey, header) {
  var normalized = normalizeHeader_(header);
  if (!normalized) return 0;
  var padded = ' ' + normalized + ' ';
  var synonyms = HEADER_SYNONYMS[fieldKey] || [];
  var best = 0;
  for (var i = 0; i < synonyms.length; i++) {
    var exactOnly = synonyms[i].charAt(0) === '=';
    var synonym = normalizeHeader_(exactOnly ? synonyms[i].slice(1) : synonyms[i]);
    var rank = synonyms.length - i; // earlier synonyms win ties
    if (normalized === synonym) best = Math.max(best, 100 + rank);
    else if (!exactOnly && padded.indexOf(' ' + synonym + ' ') !== -1) best = Math.max(best, 50 + rank);
  }
  return best;
}

/** Best one-to-one assignment of fields to header columns (greedy by score). Returns { key: col }. */
function autoMapHeaders_(headers) {
  var candidates = [];
  MAPPING_FIELDS.forEach(function (field) {
    headers.forEach(function (header, i) {
      var score = headerScore_(field.key, header);
      if (score > 0) candidates.push({ key: field.key, col: i + 1, score: score });
    });
  });
  candidates.sort(function (a, b) { return b.score - a.score || a.col - b.col; });

  var mapping = {};
  var usedCols = {};
  candidates.forEach(function (c) {
    if (mapping[c.key] || usedCols[c.col]) return;
    mapping[c.key] = c.col;
    usedCols[c.col] = true;
  });
  return mapping;
}

/**
 * Picks the header row from the top rows' raw values (as returned by Range.getValues()).
 * Headers are rows of short text labels; known invoice words count triple. Rows mixing in
 * numbers or dates look like data and are penalised. Title banners (one cell) never qualify.
 * Returns a 1-based row number, defaulting to 1.
 */
function detectHeaderRow_(rows) {
  var bestRow = 1;
  var bestScore = 0;
  rows.slice(0, HEADER_SCAN_ROWS).forEach(function (cells, index) {
    var nonEmpty = 0;
    var textCells = 0;
    var known = 0;
    cells.forEach(function (value) {
      if (value === '' || value === null || value === undefined) return;
      nonEmpty++;
      if (typeof value !== 'string' || !/[a-z]/i.test(value) || value.length > 60 || /@/.test(value)) return;
      textCells++;
      if (MAPPING_FIELDS.some(function (field) { return headerScore_(field.key, value) > 0; })) known++;
    });
    if (textCells < 2) return;
    var score = textCells + 3 * known - 2 * (nonEmpty - textCells);
    if (score > bestScore) {
      bestScore = score;
      bestRow = index + 1;
    }
  });
  return bestRow;
}

/**
 * Re-checks a stored mapping against the current header row.
 * - Header still in its column: kept.
 * - Header moved (columns inserted/deleted): follows it to the nearest column with the same header.
 * - Header gone or renamed: the field is dropped and listed in `missing`, so callers never read
 *   or overwrite the wrong column.
 * Mappings saved before header names were recorded are trusted as-is.
 */
function resolveMapping_(stored, headers) {
  var names = stored.headerNames || {};
  var resolved = { headerRow: stored.headerRow || 1, headerNames: {} };
  var moved = [];
  var missing = [];
  var used = {};

  MAPPING_FIELDS.forEach(function (field) {
    var col = stored[field.key];
    if (!col) return;
    var expected = names[field.key];
    if (expected === undefined) {
      resolved[field.key] = col;
      return;
    }
    var target = normalizeHeader_(expected);
    var found = 0;
    if (normalizeHeader_(headers[col - 1]) === target && !used[col]) {
      found = col;
    } else if (target) {
      headers.forEach(function (header, i) {
        var candidate = i + 1;
        if (used[candidate] || normalizeHeader_(header) !== target) return;
        if (!found || Math.abs(candidate - col) < Math.abs(found - col)) found = candidate;
      });
      if (found) moved.push(field.label);
    }
    if (found) {
      resolved[field.key] = found;
      resolved.headerNames[field.key] = expected;
      used[found] = true;
    } else {
      missing.push({ key: field.key, label: field.label, header: expected });
    }
  });

  if (moved.length) resolved.moved = moved;
  if (missing.length) resolved.missing = missing;
  return resolved;
}

function getHeaders_(sheet, headerRow) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0 || sheet.getLastRow() < (headerRow || 1)) return [];
  return sheet.getRange(headerRow || 1, 1, 1, lastCol).getDisplayValues()[0];
}

function mappingKey_(sheet) {
  return 'mapping_' + sheet.getSheetId();
}

/** Detects header row + column mapping for a sheet without saving anything. */
function detectMapping_(sheet) {
  var lastRow = Math.min(sheet.getLastRow(), HEADER_SCAN_ROWS);
  var lastCol = sheet.getLastColumn();
  if (lastRow === 0 || lastCol === 0) return { headerRow: 1, auto: true };
  var headerRow = detectHeaderRow_(sheet.getRange(1, 1, lastRow, lastCol).getValues());
  var mapping = autoMapHeaders_(getHeaders_(sheet, headerRow));
  mapping.headerRow = headerRow;
  mapping.auto = true;
  return mapping;
}

function getMapping(sheet) {
  sheet = sheet || SpreadsheetApp.getActiveSheet();
  var raw = PropertiesService.getDocumentProperties().getProperty(mappingKey_(sheet));
  if (!raw) return detectMapping_(sheet);
  var stored = JSON.parse(raw);
  if (!stored.headerRow) stored.headerRow = 1; // mappings saved before header detection existed
  var mapping = resolveMapping_(stored, getHeaders_(sheet, stored.headerRow));
  // Columns found by their exact header name are safe to remember. Missing ones stay stored
  // (not saved over) so the warning keeps showing until the user fixes the mapping.
  if (mapping.moved && !mapping.missing) saveMapping(mapping, sheet);
  return mapping;
}

function isMappingComplete_(mapping) {
  return MAPPING_FIELDS.every(function (field) { return !field.required || mapping[field.key]; });
}

/** Throws a clear error if columns this mapping relies on have disappeared or been renamed. */
function assertMappingCurrent_(mapping) {
  if (!mapping.missing) return;
  throw new Error(
    'Column mapping is out of date: ' +
    mapping.missing.map(function (m) { return '"' + m.header + '" (' + m.label + ')'; }).join(', ') +
    ' no longer found in the header row. Open "Column mapping", fix the columns and save.'
  );
}

function saveMapping(mapping, sheet) {
  sheet = sheet || SpreadsheetApp.getActiveSheet();
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headerRow = parseInt(mapping && mapping.headerRow, 10);
  var clean = { headerRow: headerRow >= 1 && headerRow <= HEADER_SCAN_ROWS ? headerRow : 1, headerNames: {} };
  var headers = getHeaders_(sheet, clean.headerRow);
  MAPPING_FIELDS.forEach(function (field) {
    var col = parseInt(mapping && mapping[field.key], 10);
    if (col >= 1 && col <= lastCol) {
      clean[field.key] = col;
      clean.headerNames[field.key] = headers[col - 1] === undefined ? '' : headers[col - 1];
    }
  });
  PropertiesService.getDocumentProperties().setProperty(mappingKey_(sheet), JSON.stringify(clean));
  return clean;
}

/** Sidebar: user picked a different header row. Re-detect columns for it and save. */
function setHeaderRow(headerRow) {
  var sheet = SpreadsheetApp.getActiveSheet();
  var row = parseInt(headerRow, 10) || 1;
  var mapping = autoMapHeaders_(getHeaders_(sheet, row));
  mapping.headerRow = row;
  saveMapping(mapping, sheet);
  return getSidebarState();
}

/** Appends "Invoice #", "Status", "Invoice PDF" headers for any unmapped output field, and saves. */
function ensureOutputColumns_(sheet, mapping) {
  var col = sheet.getLastColumn();
  Object.keys(OUTPUT_HEADERS).forEach(function (key) {
    if (mapping[key]) return;
    col++;
    sheet.getRange(mapping.headerRow || 1, col).setValue(OUTPUT_HEADERS[key]).setFontWeight('bold');
    mapping[key] = col;
  });
  return saveMapping(mapping, sheet);
}

function addOutputColumns() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var mapping = getMapping(sheet);
  assertMappingCurrent_(mapping);
  mapping = ensureOutputColumns_(sheet, mapping);
  return { headers: getHeaders_(sheet, mapping.headerRow), mapping: mapping };
}
