// Creates a PostgreSQL backup in the "backups" folder (keeps the last 14).
// Usage:  npm run backup
require('dotenv/config');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL was not found in .env.'); process.exit(1); }
const u = new URL(url);
const dir = path.join(__dirname, '..', 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const file = path.join(dir, 'vip_pharmacy_' + stamp + '.dump');

const r = spawnSync('pg_dump', ['-h', u.hostname, '-p', u.port || '5432', '-U', decodeURIComponent(u.username), '-F', 'c', '-f', file, u.pathname.slice(1)], {
  env: { ...process.env, PGPASSWORD: decodeURIComponent(u.password) },
  stdio: 'inherit',
});
if (r.error || r.status !== 0) {
  console.error('\nBackup failed. Most likely cause: pg_dump was not found.');
  console.error('Fix: add the PostgreSQL bin folder to the Windows PATH, e.g.  C:\\Program Files\\PostgreSQL\\16\\bin  (then close and reopen VS Code).');
  process.exit(1);
}
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.dump')).sort();
files.slice(0, Math.max(0, files.length - 14)).forEach((f) => fs.unlinkSync(path.join(dir, f)));
console.log('Backup created: ' + file);
console.log('IMPORTANT: never push the backups folder to GitHub (it contains customer data). Copy backups to a safe place (USB drive / cloud storage).');
