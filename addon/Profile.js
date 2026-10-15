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
  return mergeProfile_(PropertiesService.getUserProperties().getProperty('profile'));
}

/**
 * Stored JSON (or nothing, for a brand-new user) -> a complete profile. A missing, unreadable or
 * partial value falls back to the defaults field by field instead of breaking the sidebar.
 */
function mergeProfile_(raw) {
  var stored = {};
  if (raw) {
    try {
      stored = JSON.parse(raw) || {};
    } catch (err) {
      stored = {};
    }
  }
  if (typeof stored !== 'object' || Array.isArray(stored)) stored = {};
  var profile = {};
  Object.keys(PROFILE_DEFAULTS).forEach(function (key) {
    var value = stored[key];
    profile[key] = value === undefined || value === null ? PROFILE_DEFAULTS[key] : value;
  });
  return profile;
}

function saveProfile(input) {
  var current = getProfile();
  var profile = cleanProfileInput_(input, current);
  writeProfile_(profile);
  return profile;
}

/** Validates and normalises sidebar input over the current profile. Pure: no Google services. */
function cleanProfileInput_(input, current) {
  var profile = {};
  Object.keys(PROFILE_DEFAULTS).forEach(function (key) {
    var value = input && input[key] !== undefined && input[key] !== null ? input[key] : current[key];
    if (value === undefined || value === null) value = PROFILE_DEFAULTS[key];
    profile[key] = String(value).trim().slice(0, PROFILE_MAX_LENGTH);
  });
  // The logo is only changed through uploadLogo/removeLogo.
  profile.logoFileId = current.logoFileId || '';

  // A blank currency (new users sometimes clear it) means the default, not an error.
  profile.currency = profile.currency.toUpperCase() || PROFILE_DEFAULTS.currency;
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

// Apps Script caps one property value at 9 KB; stay under it with a message the user can act on.
var PROFILE_MAX_STORED_CHARS = 8500;

function writeProfile_(profile) {
  var json = JSON.stringify(profile);
  if (json.length > PROFILE_MAX_STORED_CHARS) {
    throw new Error('Your profile is too long to save. Shorten the address, payment instructions or email message.');
  }
  PropertiesService.getUserProperties().setProperty('profile', json);
}
