// VIP Pharmacy FRONTEND - print fix (statements, reports and tools print correctly)
// Usage (inside the Pharmacy-Store folder):  node printfix-frontend.js
// This script only updates files. Any file it overwrites is first copied to the "_update_backup" folder.
const fs = require('fs');
const path = require('path');

const NAME = 'vip-pharmacy-frontend';
let ROOT = null;
const here = process.cwd();
try { if (JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8')).name === NAME) ROOT = here; } catch (e) {}
if (!ROOT && fs.existsSync(path.join(here, NAME, 'package.json'))) ROOT = path.join(here, NAME);
if (!ROOT) { console.log('ERROR: folder "' + NAME + '" was not found. Run this script from the folder that contains ' + NAME + ' (Pharmacy-Store).'); process.exit(1); }

const FILES = {};
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const bak = path.join(ROOT, '_update_backup', stamp);
let written = 0, backedUp = 0;
for (const [rel, b64] of Object.entries(FILES)) {
  const full = path.join(ROOT, rel);
  const data = Buffer.from(b64, 'base64');
  if (fs.existsSync(full)) {
    if (fs.readFileSync(full).equals(data)) continue; // pehle se same
    const b = path.join(bak, rel);
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.copyFileSync(full, b);
    backedUp++;
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, data);
  written++;
}

const APPENDS = [{"path": "src/styles.css", "marker": "/* v5 print fix", "text": "\n/* v5 print fix: only hide the page for receipts; all other pages print normally */\n@media print{\n  body *{visibility:visible}\n  body:has(.receipt) *{visibility:hidden}\n  body:has(.receipt) .receipt,body:has(.receipt) .receipt *{visibility:visible}\n  .overlay{position:static;background:none;padding:0}\n  .modal{max-width:none;box-shadow:none}\n}\n"}];
for (const a of APPENDS) {
  const full = path.join(ROOT, a.path);
  const cur = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  if (cur.includes(a.marker)) continue;
  fs.writeFileSync(full, cur + (cur.endsWith('\n') || !cur ? '' : '\n') + a.text);
  written++;
}

console.log('Update complete: ' + written + ' files written/updated, ' + backedUp + ' old files backed up to ' + bak);
console.log('Done. Refresh the browser (Ctrl+F5), then try Print again.');
