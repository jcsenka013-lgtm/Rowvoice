/**
 * Drive helpers using native DriveApp with drive.file scope.
 * Uses the drive.file scope only: the add-on can see just the files and folders it created,
 * which keeps us out of Google's restricted-scope (CASA audit) territory and avoids GCP console setup.
 */

/** Returns the ID of the user's "SheetInvoice" Drive folder, creating it if missing or trashed. */
function getAppFolderId_() {
  var props = PropertiesService.getUserProperties();
  var folderId = props.getProperty('folderId');
  if (folderId) {
    try {
      var folder = DriveApp.getFolderById(folderId);
      if (!folder.isTrashed()) return folder.getId();
    } catch (err) {
      // folder missing, trashed, or not yet accessible
    }
  }

  try {
    var folders = DriveApp.getFoldersByName('SheetInvoice');
    while (folders.hasNext()) {
      var f = folders.next();
      if (!f.isTrashed()) {
        props.setProperty('folderId', f.getId());
        return f.getId();
      }
    }
  } catch (err) {
    // In drive.file scope, searching might only return created folders
  }

  var created = DriveApp.createFolder('SheetInvoice');
  props.setProperty('folderId', created.getId());
  return created.getId();
}

/** Uploads a file to Drive inside parent folder. Returns { id, webViewLink }. */
function uploadToDrive_(blob, name, parentId) {
  var folder = null;
  if (parentId) {
    try {
      folder = DriveApp.getFolderById(parentId);
    } catch (e) {
      folder = null;
    }
  }
  if (!folder) {
    folder = DriveApp.getRootFolder();
  }

  if (name) {
    blob.setName(name);
  }
  var file = folder.createFile(blob);
  return {
    id: file.getId(),
    webViewLink: file.getUrl()
  };
}

function downloadFromDrive_(fileId) {
  return DriveApp.getFileById(fileId).getBlob();
}
