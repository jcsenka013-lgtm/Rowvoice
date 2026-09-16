// Renders Marketplace / OAuth graphics from the site logo, using headless Edge or Chrome over the
// DevTools protocol (exact pixel sizes, transparent backgrounds). No npm dependencies (Node 22+).
//
//   node docs/store-assets/render.mjs            # writes PNGs next to this script
//   BROWSER="C:/path/to/chrome.exe" node docs/store-assets/render.mjs

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const logoSvg = readFileSync(join(here, '..', '..', 'site', 'public', 'favicon.svg'), 'utf8');

const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);

const icon = (size) => ({
  file: `icon-${size}.png`, width: size, height: size,
  html: `<div style="width:${size}px;height:${size}px">${logoSvg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>`
});

const ASSETS = [
  icon(32), icon(48), icon(96), icon(128),
  { ...icon(120), file: 'oauth-logo-120.png' },
  {
    file: 'card-banner-220x140.png', width: 220, height: 140,
    html: `<div style="width:220px;height:140px;box-sizing:border-box;padding:18px;display:flex;flex-direction:column;
      justify-content:center;gap:10px;background:linear-gradient(135deg,#1e3a5f,#274b78);color:#fff;
      font-family:'Segoe UI',Roboto,Arial,sans-serif">
      <div style="display:flex;align-items:center;gap:10px">
        ${logoSvg.replace('<svg ', '<svg width="36" height="36" ')}
        <span style="font-size:21px;font-weight:700;letter-spacing:-0.3px">Rowvoice</span>
      </div>
      <div style="font-size:12.5px;line-height:1.35;color:#d6e2f0">Spreadsheet rows to branded PDF invoices, in one click.</div>
    </div>`
  }
];

const browserPath = BROWSERS.find((p) => existsSync(p));
if (!browserPath) throw new Error('No Edge/Chrome found. Set BROWSER=/path/to/browser.');

const port = 9333 + Math.floor(Math.random() * 500);
const profileDir = mkdtempSync(join(tmpdir(), 'store-assets-'));
const browser = spawn(browserPath, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, 'about:blank'
], { stdio: 'ignore' });

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  if (!target) throw new Error('Browser did not start');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (data) => (data.error ? reject(new Error(data.error.message)) : resolve(data.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const asset of ASSETS) {
    const doc = `<!DOCTYPE html><html><body style="margin:0;background:transparent">${asset.html}</body></html>`;
    await send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(doc).toString('base64') });
    await new Promise((r) => setTimeout(r, 400));
    const { data } = await send('Page.captureScreenshot', {
      format: 'png', clip: { x: 0, y: 0, width: asset.width, height: asset.height, scale: 1 }
    });
    writeFileSync(join(here, asset.file), Buffer.from(data, 'base64'));
    console.log(`wrote ${asset.file} (${asset.width}x${asset.height})`);
  }
  ws.close();
} finally {
  browser.kill();
}
