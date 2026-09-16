/**
 * Business profile (shown on every invoice). Stored per user in UserProperties.
 */

var PROFILE_DEFAULTS = {
  businessName: '',
  businessEmail: '',
  address: '',
  taxId: '',
  currency: 'USD',
  paymentInstructions: '',
  prefix: 'INV-',
  numbering: 'spreadsheet',
  template: 'Classic',
  taxLabel: 'Tax',
  taxRate: '',
  emailSubject: 'Invoice {number} from {business}',
  emailMessage: 'Hi {client},\n\nPlease find attached invoice {number} for {total}, due {dueDate}.\n\nThank you,\n{business}',
  logoFileId: ''
};

/** 'spreadsheet': each spreadsheet counts from 1. 'account': one sequence across all your spreadsheets. */
var NUMBERING_MODES = ['spreadsheet', 'account'];

var PROFILE_MAX_LENGTH = 1000;
var LOGO_MAX_BYTES = 300 * 1024;
var LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/x-png', 'image/webp'];

function getProfile() {
  var raw = PropertiesService.getUserProperties().getProperty('profile');
  var stored = raw ? JSON.parse(raw) : {};
  var profile = {};
  Object.keys(PROFILE_DEFAULTS).forEach(function (key) {
    profile[key] = stored[key] !== undefined ? stored[key] : PROFILE_DEFAULTS[key];
  });
  return profile;
}

function saveProfile(input) {
  var current = getProfile();
  var profile = {};
  Object.keys(PROFILE_DEFAULTS).forEach(function (key) {
    var value = input && input[key] !== undefined ? input[key] : current[key];
    profile[key] = String(value).trim().slice(0, PROFILE_MAX_LENGTH);
  });
  // The logo is only changed through uploadLogo/removeLogo.
  profile.logoFileId = current.logoFileId;

  profile.currency = profile.currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(profile.currency)) {
    throw new Error('Currency must be a 3-letter code, like USD or EUR.');
  }
  if (profile.taxRate !== '') {
    var rate = parsePercent_(profile.taxRate);
    if (isNaN(rate) || rate < 0 || rate > 100) throw new Error('Tax rate must be a percentage between 0 and 100.');
    profile.taxRate = String(rate);
  }
  profile.taxLabel = profile.taxLabel.slice(0, 20) || PROFILE_DEFAULTS.taxLabel;
  if (TEMPLATES.indexOf(profile.template) === -1) profile.template = PROFILE_DEFAULTS.template;
  if (NUMBERING_MODES.indexOf(profile.numbering) === -1) profile.numbering = PROFILE_DEFAULTS.numbering;
  profile.prefix = profile.prefix.slice(0, 12);
  profile.emailSubject = profile.emailSubject.slice(0, 200) || PROFILE_DEFAULTS.emailSubject;
  profile.emailMessage = profile.emailMessage || PROFILE_DEFAULTS.emailMessage;

  writeProfile_(profile);
  return profile;
}

function uploadLogo(base64, mimeType) {
  mimeType = (mimeType || 'image/png').toLowerCase();
  if (mimeType === 'image/jpg' || mimeType === 'image/pjpeg') mimeType = 'image/jpeg';
  if (LOGO_MIME_TYPES.indexOf(mimeType) === -1) {
    throw new Error('Logo must be a PNG or JPEG image (got ' + mimeType + ').');
  }
  var bytes = Utilities.base64Decode(base64);
  if (bytes.length > LOGO_MAX_BYTES) {
    throw new Error('Logo must be smaller than 300 KB (file is ' + Math.round(bytes.length / 1024) + ' KB).');
  }
  var blob = Utilities.newBlob(bytes, mimeType, 'Rowvoice logo');
  var file = uploadToDrive_(blob, 'Rowvoice logo', getAppFolderId_());
  var profile = getProfile();
  profile.logoFileId = file.id;
  writeProfile_(profile);
  return profile;
}

function removeLogo() {
  var profile = getProfile();
  profile.logoFileId = '';
  writeProfile_(profile);
  return profile;
}

function writeProfile_(profile) {
  PropertiesService.getUserProperties().setProperty('profile', JSON.stringify(profile));
}
