n// VIP Pharmacy BACKEND - make the backend deployable on Vercel (fixes ERR_MODULE_NOT_FOUND crash)
// Usage (inside the Pharmacy-Store folder):  node vercel-backend2.js
// This script only updates files. Any file it overwrites is first copied to the "_update_backup" folder.
const fs = require('fs');
const path = require('path');

const NAME = 'vip-pharmacy-backend';
let ROOT = null;
const here = process.cwd();
try { if (JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8')).name === NAME) ROOT = here; } catch (e) {}
if (!ROOT && fs.existsSync(path.join(here, NAME, 'package.json'))) ROOT = path.join(here, NAME);
if (!ROOT) { console.log('ERROR: folder "' + NAME + '" was not found. Run this script from the folder that contains ' + NAME + ' (Pharmacy-Store).'); process.exit(1); }

const FILES = {"vercel.json": "ewogICJ2ZXJzaW9uIjogMiwKICAiYnVpbGRDb21tYW5kIjogIm5wbSBydW4gdmVyY2VsLWJ1aWxkIiwKICAib3V0cHV0RGlyZWN0b3J5IjogInB1YmxpYyIsCiAgInJld3JpdGVzIjogW3sgInNvdXJjZSI6ICIvKC4qKSIsICJkZXN0aW5hdGlvbiI6ICIvYXBpL2hhbmRsZXIiIH1dLAogICJmdW5jdGlvbnMiOiB7ICJhcGkvaGFuZGxlci5qcyI6IHsgIm1heER1cmF0aW9uIjogMzAgfSB9Cn0K", "tsconfig.build.json": "ewogICJleHRlbmRzIjogIi4vdHNjb25maWcuanNvbiIsCiAgImNvbXBpbGVyT3B0aW9ucyI6IHsgIm5vRW1pdCI6IGZhbHNlLCAib3V0RGlyIjogImRpc3QiLCAicm9vdERpciI6ICJzcmMiLCAiZGVjbGFyYXRpb24iOiBmYWxzZSwgInNvdXJjZU1hcCI6IGZhbHNlIH0sCiAgImluY2x1ZGUiOiBbInNyYyJdCn0K", "public/index.html": "PCFkb2N0eXBlIGh0bWw+CjxodG1sIGxhbmc9ImVuIj48aGVhZD48bWV0YSBjaGFyc2V0PSJ1dGYtOCI+PHRpdGxlPlZJUCBQaGFybWFjeSBBUEk8L3RpdGxlPjwvaGVhZD4KPGJvZHkgc3R5bGU9ImZvbnQtZmFtaWx5OnN5c3RlbS11aTtwYWRkaW5nOjJyZW0iPjxoMT5WSVAgUGhhcm1hY3kgQVBJPC9oMT48cD5UaGUgQVBJIGlzIHJ1bm5pbmcuIEhlYWx0aCBjaGVjazogPGEgaHJlZj0iL2FwaS92MS9oZWFsdGgiPi9hcGkvdjEvaGVhbHRoPC9hPjwvcD48L2JvZHk+PC9odG1sPgo=", "api/handler.js": "Ly8gVmVyY2VsIHNlcnZlcmxlc3MgZW50cnk6IGV4cG9zZXMgdGhlIGNvbXBpbGVkIEV4cHJlc3MgYXBwIChidWlsdCBpbnRvIC9kaXN0IGJ5ICJucG0gcnVuIHZlcmNlbC1idWlsZCIpCm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi4vZGlzdC9hcHAnKS5hcHA7Cg=="};
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

const APPENDS = [{"path": ".gitignore", "marker": "dist", "text": "dist\n_update_backup\n"}];
for (const a of APPENDS) {
  const full = path.join(ROOT, a.path);
  const cur = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  if (cur.includes(a.marker)) continue;
  fs.writeFileSync(full, cur + (cur.endsWith('\n') || !cur ? '' : '\n') + a.text);
  written++;
}


function patchFile(rel, steps) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { console.log('WARNING: ' + rel + ' was not found - skipped.'); return; }
  const orig = fs.readFileSync(full, 'utf8');
  let t = orig;
  for (const s of steps) {
    if (s.skipIf && t.includes(s.skipIf)) continue;
    if (!s.re.test(t)) { console.log('WARNING: could not patch ' + rel + ' automatically (' + s.label + ').\n         Please add manually: ' + s.manual); continue; }
    t = s.sub !== undefined ? t.replace(s.re, s.sub) : t.replace(s.re, (line) => line + s.add);
  }
  if (t !== orig) {
    const b = path.join(bak, rel);
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.writeFileSync(b, orig);
    fs.writeFileSync(full, t);
    backedUp++;
    written++;
    console.log('Patched ' + rel);
  }
}

// 1) package.json: build scripts for Vercel
try {
  const pj = path.join(ROOT, 'package.json');
  const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
  j.scripts = j.scripts || {};
  let changed = false;
  if (j.scripts['vercel-build'] !== 'prisma generate && (tsc -p tsconfig.build.json || true)') { j.scripts['vercel-build'] = 'prisma generate && (tsc -p tsconfig.build.json || true)'; changed = true; }
  if (j.scripts.postinstall !== 'prisma generate') { j.scripts.postinstall = 'prisma generate'; changed = true; }
  if (changed) { fs.mkdirSync(bak, { recursive: true }); fs.copyFileSync(pj, path.join(bak, 'package.json')); fs.writeFileSync(pj, JSON.stringify(j, null, 2) + '\n'); written++; console.log('Patched package.json (vercel-build, postinstall)'); }
} catch (e) { console.log('WARNING: package.json was not updated:', e.message); }

// 2) Prisma: add the Linux engine that Vercel needs (no database change)
patchFile('prisma/schema.prisma', [
  { label: 'binaryTargets', skipIf: 'binaryTargets', re: /^\s*provider\s*=\s*"prisma-client-js".*$/m, add: '\n  binaryTargets = ["native", "rhel-openssl-3.0.x"]', manual: 'inside generator client { } add: binaryTargets = ["native", "rhel-openssl-3.0.x"]' },
]);

// 3) Move old leftover serverless entries (from an earlier failed setup) out of the way
const apiDir = path.join(ROOT, 'api');
if (fs.existsSync(apiDir)) {
  for (const f of fs.readdirSync(apiDir)) {
    if (f === 'handler.js') continue;
    const from = path.join(apiDir, f);
    if (!fs.statSync(from).isFile()) continue;
    const to = path.join(bak, 'api', f);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to); fs.unlinkSync(from);
    console.log('Moved old api/' + f + ' to the backup folder');
  }
}
// 4) Warn about a vercel.json one level up (it would override this setup)
if (fs.existsSync(path.join(ROOT, '..', 'vercel.json'))) console.log('WARNING: there is a vercel.json OUTSIDE the backend folder (' + path.join(ROOT, '..', 'vercel.json') + '). Delete it, or Vercel may ignore the backend settings.');
console.log('\nVercel settings to check: Project > Settings > General > Root Directory = vip-pharmacy-backend, Framework Preset = Other.');

console.log('Update complete: ' + written + ' files written/updated, ' + backedUp + ' old files backed up to ' + bak);
console.log('Done. Next: git add . / git commit / git push, then redeploy on Vercel.');
