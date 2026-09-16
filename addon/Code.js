/**
 * Rowvoice: add-on entry points (menu, sidebar, sidebar state).
 */

function onOpen(e) {
  SpreadsheetApp.getUi()
    .createAddonMenu()
    .addItem('Open Rowvoice', 'showSidebar')
    .addToUi();
}

function onInstall(e) {
  onOpen(e);
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('Rowvoice');
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Everything the sidebar needs to render, in one round trip. */
function getSidebarState() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var mapping = getMapping(sheet);
  return {
    sheetId: sheet.getSheetId(),
    sheetName: sheet.getName(),
    headers: getHeaders_(sheet, mapping.headerRow),
    headerRowOptions: Math.max(1, Math.min(sheet.getLastRow(), HEADER_SCAN_ROWS)),
    sheetIsEmpty: sheet.getLastRow() === 0,
    fields: MAPPING_FIELDS,
    mapping: mapping,
    mappingComplete: isMappingComplete_(mapping),
    profile: getProfile(),
    templates: TEMPLATES,
    numberingModes: NUMBERING_MODES,
    usage: getUsage()
  };
}

/** Cheap check the sidebar runs when it regains focus, to notice a switched sheet tab. */
function getActiveSheetId() {
  return SpreadsheetApp.getActiveSheet().getSheetId();
}
