// Unit tests for the pure parts of the Apps Script add-on. The addon/*.js files are plain global
// scripts, so they're evaluated in a VM context; Google services are never called by these functions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ console });
for (const file of ['Money.js', 'Mapping.js', 'Invoice.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'addon', file), 'utf8'), context, { filename: file });
}
const {
  autoMapHeaders_, detectHeaderRow_, parseLineItems_, headerScore_, resolveMapping_, parseAmount_, parsePercent_,
  numberLocale_, formatMoney_, computeTotals_, fillPlaceholders_, driveFileIdFromUrl_
} = context;
const plain = (obj) => JSON.parse(JSON.stringify(obj));

test('auto-maps the starter sheet headers exactly', () => {
  const headers = ['Client', 'Email', 'Description', 'Amount', 'Due Date', 'Invoice #', 'Status', 'Invoice PDF'];
  assert.deepEqual(plain(autoMapHeaders_(headers)), {
    clientName: 1, clientEmail: 2, description: 3, amount: 4, dueDate: 5, invoiceNumber: 6, status: 7, pdfLink: 8
  });
});

test('auto-maps common synonyms', () => {
  const headers = ['Customer Name', 'Contact Email', 'Services', 'Total ($)', 'Payment due'];
  assert.deepEqual(plain(autoMapHeaders_(headers)), {
    clientName: 1, clientEmail: 2, description: 3, amount: 4, dueDate: 5
  });
  assert.deepEqual(plain(autoMapHeaders_(['Name', 'Price', 'Item'])), { clientName: 1, amount: 2, description: 3 });
});

test('never maps output fields fuzzily (would overwrite user data)', () => {
  const mapping = plain(autoMapHeaders_(['Client', 'Invoice date', 'Status notes', 'PDF export folder']));
  assert.equal(mapping.invoiceNumber, undefined);
  assert.equal(mapping.status, undefined);
  assert.equal(mapping.pdfLink, undefined);
});

test('a column is used for at most one field; "Client email" is email, not name', () => {
  const mapping = plain(autoMapHeaders_(['Client email', 'Client']));
  assert.equal(mapping.clientEmail, 1);
  assert.equal(mapping.clientName, 2);
});

test('generic single words only match exactly', () => {
  assert.equal(headerScore_('clientName', 'Project name'), 0);
  assert.ok(headerScore_('clientName', 'Name') > 0);
});

test('detects header row below a title banner', () => {
  const rows = [
    ['2026 Freelance Budget Tracker', '', '', '', ''],
    ['', '', '', '', ''],
    ['Prepared by Jane', '', '', '', ''],
    ['Client', 'Email', 'Project', 'Fee', 'Due'],
    ['Acme Co', 'ap@acme.example', 'Logo design', 1200, new Date()],
    ['Globex', 'bill@globex.example', 'Audit', 450, new Date()]
  ];
  assert.equal(detectHeaderRow_(rows), 4);
});

test('header detection defaults to row 1 for plain and empty sheets', () => {
  assert.equal(detectHeaderRow_([]), 1);
  assert.equal(detectHeaderRow_([['Client', 'Amount'], ['Acme', 100]]), 1);
  assert.equal(detectHeaderRow_([[1, 2], [3, 4]]), 1);
});

test('text-heavy data rows do not beat the real header', () => {
  const rows = [
    ['Name', 'Notes', 'Amount'],
    ['Some long client name', 'Paid via bank transfer', 'n/a'],
    ['Another client', 'Follow up next week', 'tbd']
  ];
  assert.equal(detectHeaderRow_(rows), 1);
});

test('parses line items and falls back to the amount column', () => {
  const items = plain(parseLineItems_('Website audit | 450\nMaintenance | $300.50', ''));
  assert.deepEqual(items, [
    { description: 'Website audit', amount: 450 },
    { description: 'Maintenance', amount: 300.5 }
  ]);
  assert.deepEqual(plain(parseLineItems_('Logo design', 1200)), [{ description: 'Logo design', amount: 1200 }]);
  assert.deepEqual(plain(parseLineItems_('', '$1,200')), [{ description: 'Services', amount: 1200 }]);
  assert.deepEqual(plain(parseLineItems_('Audit | 1.200,50', '', ',')), [{ description: 'Audit', amount: 1200.5 }]);
});

test('maps tax rate, discount and notes columns', () => {
  const mapping = plain(autoMapHeaders_(['Client', 'Services', 'Total', 'Discount', 'VAT rate', 'Notes']));
  assert.deepEqual(mapping, { clientName: 1, description: 2, amount: 3, discount: 4, taxRate: 5, notes: 6 });
});

/* ---------- Mapping survives column changes ---------- */

const stored = {
  headerRow: 1, clientName: 1, amount: 2, invoiceNumber: 3,
  headerNames: { clientName: 'Client', amount: 'Amount', invoiceNumber: 'Invoice #' }
};

test('resolveMapping_: unchanged headers keep their columns', () => {
  const r = plain(resolveMapping_(stored, ['Client', 'Amount', 'Invoice #']));
  assert.equal(r.clientName, 1);
  assert.equal(r.amount, 2);
  assert.equal(r.invoiceNumber, 3);
  assert.equal(r.moved, undefined);
  assert.equal(r.missing, undefined);
});

test('resolveMapping_: follows headers when a column is inserted', () => {
  const r = plain(resolveMapping_(stored, ['Client', 'Email', 'Amount', 'Invoice #']));
  assert.equal(r.clientName, 1);
  assert.equal(r.amount, 3);
  assert.equal(r.invoiceNumber, 4);
  assert.deepEqual(r.moved, ['Amount', 'Invoice # (written back)']);
});

test('resolveMapping_: a renamed or deleted header is reported, never guessed', () => {
  const r = plain(resolveMapping_(stored, ['Client', 'Price', 'Notes']));
  assert.equal(r.amount, undefined);
  assert.equal(r.invoiceNumber, undefined, 'must not write invoice numbers into "Notes"');
  assert.deepEqual(r.missing.map((m) => m.key), ['amount', 'invoiceNumber']);
});

test('resolveMapping_: duplicate headers pick the nearest column; legacy mappings are trusted', () => {
  const r = plain(resolveMapping_(
    { headerRow: 1, amount: 3, headerNames: { amount: 'Amount' } },
    ['Amount', 'X', 'Y', 'Amount']
  ));
  assert.equal(r.amount, 4);
  const legacy = plain(resolveMapping_({ headerRow: 1, clientName: 5 }, ['a']));
  assert.equal(legacy.clientName, 5);
  assert.equal(legacy.missing, undefined);
});

/* ---------- Money ---------- */

test('parseAmount_: US and European formats', () => {
  const cases = [
    ['$1,200.50', '.', 1200.5], ['1,200', '.', 1200], ['1.200', '.', 1.2], ['12,50', '.', 12.5],
    ['1.200,50 €', ',', 1200.5], ['1.200', ',', 1200], ['1,2', ',', 1.2], ['1 200,50', ',', 1200.5],
    ['1,000,000', '.', 1000000], ['1.000.000', ',', 1000000], ["CHF 1'200.50", '.', 1200.5],
    ['(300)', '.', -300], ['-45', '.', -45], ['$-5.25', '.', -5.25], [42, ',', 42]
  ];
  for (const [input, decimal, expected] of cases) {
    assert.equal(parseAmount_(input, decimal), expected, `${input} with "${decimal}"`);
  }
  assert.ok(Number.isNaN(parseAmount_('n/a', '.')));
  assert.ok(Number.isNaN(parseAmount_('', '.')));
});

test('parsePercent_ and numberLocale_', () => {
  assert.equal(parsePercent_('20%'), 20);
  assert.equal(parsePercent_('7,5 %', ','), 7.5);
  assert.deepEqual(plain(numberLocale_('de_DE')), { tag: 'de-DE', decimal: ',' });
  assert.deepEqual(plain(numberLocale_('en_US')), { tag: 'en-US', decimal: '.' });
  assert.equal(numberLocale_('!!bad').tag, 'en-US');
});

test('formatMoney_ uses the spreadsheet locale', () => {
  assert.equal(formatMoney_(1200.5, 'USD', 'en-US'), '$1,200.50');
  assert.match(formatMoney_(1200.5, 'EUR', 'de-DE'), /^1[.]200,50[\s ]€$/);
  assert.equal(formatMoney_(10, 'ZZZZ', 'en-US'), 'ZZZZ 10.00');
});

test('computeTotals_: discount before tax, cent rounding, discount capped at subtotal', () => {
  assert.deepEqual(plain(computeTotals_([{ amount: 450 }, { amount: 300 }], 50, 20)),
    { subtotal: 750, discount: 50, taxRate: 20, tax: 140, total: 840 });
  assert.deepEqual(plain(computeTotals_([{ amount: 19.99 }, { amount: null }], 0, 8.25)),
    { subtotal: 19.99, discount: 0, taxRate: 8.25, tax: 1.65, total: 21.64 });
  assert.equal(computeTotals_([{ amount: 0.1 }, { amount: 0.2 }], 0, 0).total, 0.3);
  assert.equal(computeTotals_([{ amount: 100 }], 500, 10).total, 0);
});

test('fillPlaceholders_ and driveFileIdFromUrl_', () => {
  assert.equal(fillPlaceholders_('Invoice {number} for {client} {unknown}', { number: 'INV-1', client: 'Acme' }),
    'Invoice INV-1 for Acme {unknown}');
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  assert.equal(driveFileIdFromUrl_(`https://drive.google.com/file/d/${id}/view?usp=drivesdk`), id);
  assert.equal(driveFileIdFromUrl_(`https://drive.google.com/open?id=${id}`), id);
  assert.equal(driveFileIdFromUrl_('https://example.com'), '');
});

/* ---------- Templates ---------- */

// Minimal HtmlService template evaluator: <? code ?>, <?= escaped ?>, <?!= raw ?>.
function renderTemplate(file, vars) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'addon', 'templates', file), 'utf8');
  let code = 'let out = "";\n';
  let last = 0;
  source.replace(/<\?(!?=)?([\s\S]*?)\?>/g, (match, kind, body, offset) => {
    code += `out += ${JSON.stringify(source.slice(last, offset))};\n`;
    if (kind === '=') code += `out += esc(${body});\n`;
    else if (kind === '!=') code += `out += (${body});\n`;
    else code += `${body}\n`;
    last = offset + match.length;
    return match;
  });
  code += `out += ${JSON.stringify(source.slice(last))};\nreturn out;`;
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return new Function('esc', 'nl2br_', ...Object.keys(vars), code)(esc, context.nl2br_, ...Object.values(vars));
}

const sampleProfile = {
  businessName: 'Northwind Studio', businessEmail: 'hi@northwind.example', address: '1 Main St\nSpringfield',
  taxId: 'VAT GB123456789', paymentInstructions: 'Bank transfer to 12-34-56', currency: 'USD'
};
const fullInvoice = {
  number: 'INV-0007', issueDate: 'Sep 16, 2026', dueDate: 'Oct 16, 2026', clientName: 'Globex <Ltd>',
  clientEmail: 'billing@globex.example', clientAddress: '9 Side Rd', notes: 'Thanks for your business!\nPO 4411',
  items: [{ description: 'Website audit', amountText: '$450.00' }, { description: 'Maintenance', amountText: '$300.00' }],
  showSubtotal: true, subtotalText: '$750.00', discountText: '-$50.00', taxLabel: 'VAT (20%)', taxText: '$140.00',
  totalText: '$840.00'
};
const plainInvoice = Object.assign({}, fullInvoice, {
  notes: '', showSubtotal: false, discountText: '', taxLabel: '', taxText: '', totalText: '$750.00'
});

for (const file of ['Classic.html', 'Modern.html']) {
  test(`${file}: renders totals breakdown, tax ID and notes, escaping client data`, () => {
    const html = renderTemplate(file, { invoice: fullInvoice, profile: sampleProfile, logo: '', showFooter: true });
    for (const text of ['Subtotal', '$750.00', 'Discount', '-$50.00', 'VAT (20%)', '$140.00', '$840.00',
      'Tax ID: VAT GB123456789', 'Notes', 'PO 4411', 'Made with SheetInvoice', 'Globex &lt;Ltd&gt;']) {
      assert.ok(html.includes(text), `${file} should include ${text}`);
    }
    assert.ok(!html.includes('Globex <Ltd>'));
    if (process.env.RENDER_DIR) fs.writeFileSync(path.join(process.env.RENDER_DIR, file), html);
  });

  test(`${file}: no subtotal rows or notes when there is no tax or discount`, () => {
    const html = renderTemplate(file, {
      invoice: plainInvoice, profile: Object.assign({}, sampleProfile, { taxId: '' }), logo: '', showFooter: false
    });
    for (const text of ['Subtotal', 'Discount', 'Tax ID', 'Notes', 'Made with SheetInvoice']) {
      assert.ok(!html.includes(text), `${file} should not include ${text}`);
    }
  });
}
