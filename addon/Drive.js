/**
 * Drive helpers over the Drive v3 REST API (UrlFetchApp + the script's OAuth token).
 *
 * Why not DriveApp: DriveApp requires the full https://www.googleapis.com/auth/drive scope, which is a
 * *restricted* scope (CASA security assessment before Marketplace publishing). With the drive.file
 * scope, DriveApp calls such as createFolder fail with "Specified permissions are not sufficient".
 * The REST API works with drive.file: the add-on can create files and read back only the files it
 * created, and it can't see anything else in the user's Drive.
 *
 * Requires "https://www.googleapis.com/" in urlFetchWhitelist (appsscript.json).
 */

var DRIVE_API = 'https://www.googleapis.com/drive/v3';
var DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
var APP_FOLDER_NAME = 'SheetInvoice';
var FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Calls the Drive API. Returns the raw HTTPResponse for 2xx; throws a readable error otherwise. */
function driveFetch_(url, options) {
  var params = Object.assign({ muteHttpExceptions: true }, options || {});
  params.headers = Object.assign({ Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, params.headers || {});
  var response = UrlFetchApp.fetch(url, params);
  var code = response.getResponseCode();
  if (code >= 200 && code < 300) return response;

  var message = 'HTTP ' + code;
  try {
    message = JSON.parse(response.getContentText()).error.message || message;
  } catch (err) {
    // not a JSON error body
  }
  var error = new Error('Google Drive error: ' + message);
  error.status = code;
  throw error;
}

function driveJson_(url, options) {
  return JSON.parse(driveFetch_(url, options).getContentText());
}

/** File metadata, or null if the file is gone or not accessible to this app. */
function driveGetMetadata_(fileId, fields) {
  try {
    return driveJson_(DRIVE_API + '/files/' + encodeURIComponent(fileId) +
      '?supportsAllDrives=true&fields=' + encodeURIComponent(fields || 'id,trashed'));
  } catch (err) {
    if (err.status === 404 || err.status === 403) return null;
    throw err;
  }
}

/** Returns the ID of the user's "SheetInvoice" Drive folder, creating it if missing or trashed. */
function getAppFolderId_() {
  var props = PropertiesService.getUserProperties();
  var folderId = props.getProperty('folderId');
  if (folderId) {
    var meta = driveGetMetadata_(folderId);
    if (meta && !meta.trashed) return folderId;
  }

  // With drive.file this search only sees folders this app created, e.g. after properties were reset.
  var query = "name = '" + APP_FOLDER_NAME + "' and mimeType = '" + FOLDER_MIME + "' and trashed = false";
  var found = driveJson_(DRIVE_API + '/files?pageSize=1&fields=files(id)&q=' + encodeURIComponent(query)).files;
  if (found && found.length) {
    props.setProperty('folderId', found[0].id);
    return found[0].id;
  }

  var created = driveJson_(DRIVE_API + '/files?fields=id', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: FOLDER_MIME })
  });
  props.setProperty('folderId', created.id);
  return created.id;
}

/** Uploads a blob (multipart upload) into parentId, or My Drive root if none. Returns { id, webViewLink }. */
function uploadToDrive_(blob, name, parentId) {
  var metadata = { name: name || blob.getName() || 'Untitled' };
  if (parentId) metadata.parents = [parentId];

  var boundary = 'sheetinvoice' + Utilities.getUuid().replace(/-/g, '');
  var head = '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: ' + (blob.getContentType() || 'application/octet-stream') + '\r\n\r\n';
  var tail = '\r\n--' + boundary + '--';
  var body = Utilities.newBlob(head).getBytes()
    .concat(blob.getBytes())
    .concat(Utilities.newBlob(tail).getBytes());

  return driveJson_(DRIVE_UPLOAD_API + '/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'post',
    contentType: 'multipart/related; boundary=' + boundary,
    payload: body
  });
}

/** Downloads a file this app created, as a Blob. */
function downloadFromDrive_(fileId) {
  return driveFetch_(DRIVE_API + '/files/' + encodeURIComponent(fileId) + '?alt=media').getBlob();
}
