/**
 * Locale-aware money: parsing amounts typed as text, formatting, and invoice totals.
 * Pure functions (no Google services), unit-tested in tests/addon.test.js.
 *
 * Numbers typed into number-formatted cells arrive as real numbers and need no parsing. Text such as
 * line items ("Audit | 1.200,50") or "$1,200" is parsed using the spreadsheet locale's decimal
 * separator to settle ambiguous cases like "1.200" (1.2 in en_US, 1200 in de_DE).
 */

/** { tag: 'de-DE', decimal: ',' } for a spreadsheet locale like 'de_DE'. Falls back to en-US. */
function numberLocale_(spreadsheetLocale) {
  var tag = String(spreadsheetLocale || 'en_US').replace(/_/g, '-');
  try {
    new Intl.NumberFormat(tag);
  } catch (err) {
    tag = 'en-US';
  }
  var decimal = '.';
  try {
    new Intl.NumberFormat(tag).formatToParts(1.5).forEach(function (part) {
      if (part.type === 'decimal') decimal = part.value;
    });
  } catch (err) {
    // formatToParts unsupported: keep '.'
  }
  return { tag: tag, decimal: decimal };
}

/**
 * Parses "$1,200.50", "1.200,50 €", "(300)", "-45", "12,5". Returns NaN when there's no number.
 * With a single kind of separator: several occurrences are thousands separators; the locale's
 * decimal separator is a decimal point; the other separator followed by exactly 3 digits is a
 * thousands separator, otherwise a decimal point.
 */
function parseAmount_(value, decimalSeparator) {
  if (typeof value === 'number') return value;
  var text = String(value === null || value === undefined ? '' : value).trim();
  var digits = text.replace(/[^\d.,]/g, '');
  if (!/\d/.test(digits)) return NaN;
  var negative = /^\(.*\)$/.test(text) || /^[^\d]*-/.test(text);

  var lastDot = digits.lastIndexOf('.');
  var lastComma = digits.lastIndexOf(',');
  var decimalIndex = -1;
  if (lastDot !== -1 && lastComma !== -1) {
    decimalIndex = Math.max(lastDot, lastComma);
  } else if (lastDot !== -1 || lastComma !== -1) {
    var sep = lastDot !== -1 ? '.' : ',';
    var index = Math.max(lastDot, lastComma);
    var occurrences = digits.split(sep).length - 1;
    var digitsAfter = digits.length - index - 1;
    if (occurrences > 1) decimalIndex = -1;
    else if (sep === (decimalSeparator || '.')) decimalIndex = index;
    else decimalIndex = digitsAfter === 3 ? -1 : index;
  }

  var number = decimalIndex === -1
    ? parseFloat(digits.replace(/[.,]/g, ''))
    : parseFloat(digits.slice(0, decimalIndex).replace(/[.,]/g, '') + '.' + digits.slice(decimalIndex + 1));
  if (isNaN(number)) return NaN;
  return negative ? -number : number;
}

/** "20%", "7,5", 20 -> percentage points (20, 7.5, 20). */
function parsePercent_(value, decimalSeparator) {
  return roundTo_(parseAmount_(value, decimalSeparator), 4);
}

function roundTo_(value, places) {
  var factor = Math.pow(10, places);
  return Math.round((value + (value < 0 ? -Number.EPSILON : Number.EPSILON)) * factor) / factor;
}

function formatMoney_(amount, currency, localeTag) {
  try {
    return new Intl.NumberFormat(localeTag || 'en-US', { style: 'currency', currency: currency }).format(amount);
  } catch (err) {
    return currency + ' ' + amount.toFixed(2);
  }
}

/** Subtotal of line items, minus discount, plus tax on the discounted amount. Cent-rounded. */
function computeTotals_(items, discount, taxRatePercent) {
  var subtotal = roundTo_(items.reduce(function (sum, item) { return sum + (item.amount || 0); }, 0), 2);
  var cleanDiscount = roundTo_(Math.min(Math.abs(discount || 0), Math.max(subtotal, 0)), 2);
  var taxable = roundTo_(subtotal - cleanDiscount, 2);
  var tax = roundTo_(taxable * (taxRatePercent || 0) / 100, 2);
  return {
    subtotal: subtotal,
    discount: cleanDiscount,
    taxRate: taxRatePercent || 0,
    tax: tax,
    total: roundTo_(taxable + tax, 2)
  };
}

/** Fills {placeholders} in email templates. Unknown placeholders are left as typed. */
function fillPlaceholders_(template, values) {
  return String(template || '').replace(/\{(\w+)\}/g, function (match, key) {
    return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match;
  });
}
