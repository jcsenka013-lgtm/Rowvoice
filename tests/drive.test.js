// Drive.js against a fake Drive REST API: no DriveApp (needs the restricted drive scope), correct
// multipart uploads, and folder recovery.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup({ storedFolderId = null, folderMeta = null, searchResult = [] } = {}) {
  const calls = [];
  const props = new Map(storedFolderId ? [['folderId', storedFolderId]] : []);
  const respond = (code, body) => ({
    getResponseCode: () => code,
    getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)),
    getBlob: () => ({ bytes: body })
  });
  const bytes = (s) => Array.from(Buffer.from(s, 'utf8'));
  const context = vm.createContext({
    console,
    ScriptApp: { getOAuthToken: () => 'token-123' },
    PropertiesService: {
      getUserProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) })
    },
    Utilities: { getUuid: () => 'aaaa-bbbb', newBlob: (s) => ({ getBytes: () => bytes(s) }) },
    DriveApp: new Proxy({}, { get: () => { throw new Error('DriveApp must not be used'); } }),
    UrlFetchApp: {
      fetch(url, params) {
        calls.push({ url, params });
        if (url.includes('/files/denied')) return respond(403, { error: { message: 'Insufficient permissions' } });
        if (url.includes('/files/') && url.includes('fields=id%2Ctrashed')) {
          return folderMeta ? respond(200, folderMeta) : respond(404, { error: { message: 'File not found' } });
        }
        if (url.includes('/files?pageSize=1')) return respond(200, { files: searchResult });
        if (url.endsWith('/drive/v3/files?fields=id')) return respond(200, { id: 'new-folder' });
        if (url.includes('uploadType=multipart')) return respond(200, { id: 'file-1', webViewLink: 'https://drive/file-1' });
        if (url.includes('alt=media')) return respond(200, 'PDFDATA');
        return respond(500, 'oops');
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'addon', 'Drive.js'), 'utf8'), context);
  return { context, calls, props, bytes };
}

test('reuses the stored folder when it still exists', () => {
  const { context, calls } = setup({ storedFolderId: 'f1', folderMeta: { id: 'f1', trashed: false } });
  assert.equal(context.getAppFolderId_(), 'f1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.headers.Authorization, 'Bearer token-123');
});

test('finds an app-created folder by name when the stored one is trashed', () => {
  const { context, props } = setup({ storedFolderId: 'old', folderMeta: { id: 'old', trashed: true }, searchResult: [{ id: 'found' }] });
  assert.equal(context.getAppFolderId_(), 'found');
  assert.equal(props.get('folderId'), 'found');
});

test('creates the folder when none exists (the old DriveApp.createFolder failure)', () => {
  const { context, calls, props } = setup();
  assert.equal(context.getAppFolderId_(), 'new-folder');
  const create = calls.at(-1);
  assert.equal(create.params.method, 'post');
  assert.deepEqual(JSON.parse(create.params.payload), { name: 'SheetInvoice', mimeType: 'application/vnd.google-apps.folder' });
  assert.equal(props.get('folderId'), 'new-folder');
});

test('multipart upload carries metadata with parent and the exact file bytes', () => {
  const { context, calls, bytes } = setup();
  const blob = { getName: () => 'x.pdf', getContentType: () => 'application/pdf', getBytes: () => bytes('%PDF-1.4 é') };
  const result = context.uploadToDrive_(blob, 'INV-0001 - Acme.pdf', 'folder-9');
  assert.equal(result.webViewLink, 'https://drive/file-1');

  const { params } = calls[0];
  const boundary = /boundary=(\S+)/.exec(params.contentType)[1];
  const body = Buffer.from(params.payload).toString('utf8');
  const parts = body.split('--' + boundary);
  assert.equal(parts.length, 4, 'preamble, metadata, media, closing');
  assert.deepEqual(JSON.parse(parts[1].split('\r\n\r\n')[1]), { name: 'INV-0001 - Acme.pdf', parents: ['folder-9'] });
  assert.match(parts[2], /Content-Type: application\/pdf\r\n\r\n%PDF-1\.4 é\r\n$/);
  assert.equal(parts[3], '--');
});

test('download uses alt=media; API errors surface a readable message', () => {
  const { context } = setup();
  assert.equal(context.downloadFromDrive_('file-1').bytes, 'PDFDATA');
  assert.throws(() => context.downloadFromDrive_('denied'), /Google Drive error: Insufficient permissions/);
});
