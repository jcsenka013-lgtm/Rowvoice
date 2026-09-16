/**
 * 1-click starter sheet: a formatted "Invoices" tab with headers, sample rows and a saved mapping,
 * so a new user can create their first invoice without setting anything up.
 */

var STARTER_HEADERS = ['Client', 'Email', 'Description', 'Amount', 'Due Date', 'Invoice #', 'Status', 'Invoice PDF'];
var STARTER_WIDTHS = [170, 210, 300, 110, 120, 100, 100, 120];
var STARTER_FORMAT_ROWS = 200;

function insertStarterSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.insertSheet(uniqueSheetName_(spreadsheet, 'Invoices'));
  var cols = STARTER_HEADERS.length;
  var today = new Date();

  sheet.getRange(1, 1, 1, cols).setValues([STARTER_HEADERS])
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#1e3a5f')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);
  sheet.setFrozenRows(1);

  sheet.getRange(2, 1, 2, 5).setValues([
    ['Acme Co', 'ap@acme.example', 'Logo design', 1200, addDays_(today, 14)],
    ['Globex Ltd', 'billing@globex.example', 'Website audit | 450\nMonthly maintenance | 300', 750, addDays_(today, 30)]
  ]);

  var body = sheet.getRange(2, 1, STARTER_FORMAT_ROWS - 1, cols);
  body.setVerticalAlignment('top');
  sheet.getRange(2, 3, STARTER_FORMAT_ROWS - 1, 1).setWrap(true);
  sheet.getRange(2, 4, STARTER_FORMAT_ROWS - 1, 1).setNumberFormat('#,##0.00');
  sheet.getRange(2, 5, STARTER_FORMAT_ROWS - 1, 1).setNumberFormat('mmm d, yyyy');
  STARTER_WIDTHS.forEach(function (width, i) { sheet.setColumnWidth(i + 1, width); });
  sheet.getRange(1, 1, STARTER_FORMAT_ROWS, cols)
    .setBorder(null, null, true, null, null, true, '#e4e7eb', SpreadsheetApp.BorderStyle.SOLID);

  var statusRange = sheet.getRange(2, 7, STARTER_FORMAT_ROWS - 1, 1);
  statusRange.setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUS_VALUES, true).setAllowInvalid(true).build()
  );
  sheet.setConditionalFormatRules([
    statusRule_(statusRange, 'Paid', '#e6f4ea', '#137333'),
    statusRule_(statusRange, 'Overdue', '#fce8e6', '#c5221f'),
    statusRule_(statusRange, 'Unpaid', '#fef7e0', '#b06000')
  ]);

  if (sheet.getMaxColumns() > cols) sheet.deleteColumns(cols + 1, sheet.getMaxColumns() - cols);

  saveMapping({
    headerRow: 1, clientName: 1, clientEmail: 2, description: 3, amount: 4, dueDate: 5,
    invoiceNumber: 6, status: 7, pdfLink: 8
  }, sheet);

  sheet.activate();
  sheet.getRange(2, 1, 1, cols).activate(); // first sample row selected: ready to click Create
  return getSidebarState();
}

function statusRule_(range, text, background, color) {
  return SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(text).setBackground(background).setFontColor(color).setRanges([range]).build();
}

function uniqueSheetName_(spreadsheet, base) {
  var name = base;
  for (var n = 2; spreadsheet.getSheetByName(name); n++) name = base + ' ' + n;
  return name;
}

function addDays_(date, days) {
  var copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}
