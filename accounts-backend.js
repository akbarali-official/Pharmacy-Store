// VIP Pharmacy BACKEND - Supplier accounts and purchase returns (adds new database tables)
// Usage (inside the Pharmacy-Store folder):  node accounts-backend.js
// This script only updates files. Any file it overwrites is first copied to the "_update_backup" folder.
const fs = require('fs');
const path = require('path');

const NAME = 'vip-pharmacy-backend';
let ROOT = null;
const here = process.cwd();
try { if (JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8')).name === NAME) ROOT = here; } catch (e) {}
if (!ROOT && fs.existsSync(path.join(here, NAME, 'package.json'))) ROOT = path.join(here, NAME);
if (!ROOT) { console.log('ERROR: folder "' + NAME + '" was not found. Run this script from the folder that contains ' + NAME + ' (Pharmacy-Store).'); process.exit(1); }

const FILES = {"src/routes/payables.ts": "aW1wb3J0IHsgUm91dGVyIH0gZnJvbSAnZXhwcmVzcyc7CmltcG9ydCB7IHogfSBmcm9tICd6b2QnOwppbXBvcnQgeyBwcmlzbWEsIEQgfSBmcm9tICcuLi9kYic7CmltcG9ydCB7IGF1dGgsIHdyYXAsIGF1ZGl0LCBIdHRwRXJyb3IgfSBmcm9tICcuLi9taWRkbGV3YXJlJzsKaW1wb3J0IHsgdGFrZUZyb21CYXRjaCB9IGZyb20gJy4uL3N0b2NrJzsKCmV4cG9ydCBjb25zdCByID0gUm91dGVyKCk7CmNvbnN0IG51bSA9ICh2OiBhbnkpID0+IE51bWJlcih2ID8/IDApOwpjb25zdCBWSUVXID0gWydPV05FUicsICdNQU5BR0VSJywgJ0FDQ09VTlRBTlQnLCAnSU5WRU5UT1JZJ107CmNvbnN0IFBBWSA9IFsnT1dORVInLCAnTUFOQUdFUicsICdBQ0NPVU5UQU5UJ107CmNvbnN0IFJFVFVSTiA9IFsnT1dORVInLCAnTUFOQUdFUicsICdJTlZFTlRPUlknXTsKY29uc3Qgc3VtTWFwID0gKHJvd3M6IGFueVtdLCBrZXk6IHN0cmluZykgPT4gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4ocm93cy5tYXAoKHgpID0+IFt4LnN1cHBsaWVySWQsIG51bSh4Ll9zdW1ba2V5XSldKSk7CgovLyAtLS0tLS0tLS0tIFN1cHBsaWVyIGJhbGFuY2VzOiBwdXJjaGFzZWQgLSByZXR1cm5lZCAtIHBhaWQgLS0tLS0tLS0tLQpyLmdldCgnL3BheWFibGVzJywgYXV0aCguLi5WSUVXKSwgd3JhcChhc3luYyAocmVxOiBhbnksIHJlczogYW55KSA9PiB7CiAgY29uc3QgYnJhbmNoSWQgPSByZXEudXNlci5icmFuY2hJZDsKICBjb25zdCBbc3VwcGxpZXJzLCBib3VnaHQsIHJldHVybmVkLCBwYWlkXSA9IGF3YWl0IFByb21pc2UuYWxsKFsKICAgIHByaXNtYS5zdXBwbGllci5maW5kTWFueSh7IHdoZXJlOiB7IGFjdGl2ZTogdHJ1ZSB9LCBvcmRlckJ5OiB7IG5hbWU6ICdhc2MnIH0gfSksCiAgICBwcmlzbWEucHVyY2hhc2UuZ3JvdXBCeSh7IGJ5OiBbJ3N1cHBsaWVySWQnXSwgd2hlcmU6IHsgYnJhbmNoSWQsIHN0YXR1czogJ1JFQ0VJVkVEJyB9LCBfc3VtOiB7IHRvdGFsOiB0cnVlIH0gfSksCiAgICBwcmlzbWEucHVyY2hhc2VSZXR1cm4uZ3JvdXBCeSh7IGJ5OiBbJ3N1cHBsaWVySWQnXSwgd2hlcmU6IHsgYnJhbmNoSWQgfSwgX3N1bTogeyB0b3RhbDogdHJ1ZSB9IH0pLAogICAgcHJpc21hLnN1cHBsaWVyUGF5bWVudC5ncm91cEJ5KHsgYnk6IFsnc3VwcGxpZXJJZCddLCB3aGVyZTogeyBicmFuY2hJZCB9LCBfc3VtOiB7IGFtb3VudDogdHJ1ZSB9IH0pLAogIF0pOwogIGNvbnN0IGIgPSBzdW1NYXAoYm91Z2h0LCAndG90YWwnKSwgcnQgPSBzdW1NYXAocmV0dXJuZWQsICd0b3RhbCcpLCBwID0gc3VtTWFwKHBhaWQsICdhbW91bnQnKTsKICBjb25zdCBpdGVtcyA9IHN1cHBsaWVycy5tYXAoKHMpID0+IHsKICAgIGNvbnN0IHB1cmNoYXNlZCA9IGIuZ2V0KHMuaWQpIHx8IDAsIHJldCA9IHJ0LmdldChzLmlkKSB8fCAwLCBwZCA9IHAuZ2V0KHMuaWQpIHx8IDA7CiAgICByZXR1cm4geyBpZDogcy5pZCwgbmFtZTogcy5uYW1lLCBwaG9uZTogcy5waG9uZSwgcGF5bWVudFRlcm1zOiBzLnBheW1lbnRUZXJtcywgcHVyY2hhc2VkLCByZXR1cm5lZDogcmV0LCBwYWlkOiBwZCwgYmFsYW5jZTogcHVyY2hhc2VkIC0gcmV0IC0gcGQgfTsKICB9KTsKICByZXMuanNvbih7IGl0ZW1zLCB0b3RhbFBheWFibGU6IGl0ZW1zLnJlZHVjZSgodCwgaSkgPT4gdCArIE1hdGgubWF4KGkuYmFsYW5jZSwgMCksIDApIH0pOwp9KSk7CgovLyAtLS0tLS0tLS0tIFN0YXRlbWVudCAoY2hyb25vbG9naWNhbCBsZWRnZXIgd2l0aCBydW5uaW5nIGJhbGFuY2UpIC0tLS0tLS0tLS0Kci5nZXQoJy9wYXlhYmxlcy86aWQvc3RhdGVtZW50JywgYXV0aCguLi5WSUVXKSwgd3JhcChhc3luYyAocmVxOiBhbnksIHJlczogYW55KSA9PiB7CiAgY29uc3QgaWQgPSBOdW1iZXIocmVxLnBhcmFtcy5pZCksIGJyYW5jaElkID0gcmVxLnVzZXIuYnJhbmNoSWQ7CiAgY29uc3Qgc3VwcGxpZXIgPSBhd2FpdCBwcmlzbWEuc3VwcGxpZXIuZmluZFVuaXF1ZSh7IHdoZXJlOiB7IGlkIH0gfSk7CiAgaWYgKCFzdXBwbGllcikgdGhyb3cgbmV3IEh0dHBFcnJvcig0MDQsICdTdXBwbGllciBub3QgZm91bmQnKTsKICBjb25zdCBbcHVyLCByZXQsIHBheV0gPSBhd2FpdCBQcm9taXNlLmFsbChbCiAgICBwcmlzbWEucHVyY2hhc2UuZmluZE1hbnkoeyB3aGVyZTogeyBzdXBwbGllcklkOiBpZCwgYnJhbmNoSWQsIHN0YXR1czogJ1JFQ0VJVkVEJyB9LCBzZWxlY3Q6IHsgaWQ6IHRydWUsIGludm9pY2VObzogdHJ1ZSwgcHVyY2hhc2VEYXRlOiB0cnVlLCB0b3RhbDogdHJ1ZSB9IH0pLAogICAgcHJpc21hLnB1cmNoYXNlUmV0dXJuLmZpbmRNYW55KHsgd2hlcmU6IHsgc3VwcGxpZXJJZDogaWQsIGJyYW5jaElkIH0sIHNlbGVjdDogeyBpZDogdHJ1ZSwgcmVhc29uOiB0cnVlLCB0b3RhbDogdHJ1ZSwgY3JlYXRlZEF0OiB0cnVlIH0gfSksCiAgICBwcmlzbWEuc3VwcGxpZXJQYXltZW50LmZpbmRNYW55KHsgd2hlcmU6IHsgc3VwcGxpZXJJZDogaWQsIGJyYW5jaElkIH0sIHNlbGVjdDogeyBpZDogdHJ1ZSwgYW1vdW50OiB0cnVlLCBtZXRob2Q6IHRydWUsIHJlZmVyZW5jZTogdHJ1ZSwgbm90ZTogdHJ1ZSwgcGFpZEF0OiB0cnVlIH0gfSksCiAgXSk7CiAgY29uc3Qgcm93czogYW55W10gPSBbCiAgICAuLi5wdXIubWFwKCh4KSA9PiAoeyBkYXRlOiB4LnB1cmNoYXNlRGF0ZSwgdHlwZTogJ1B1cmNoYXNlJywgcmVmOiB4Lmludm9pY2VObyB8fCAnUE8tJyArIHguaWQsIG5vdGU6ICcnLCBjaGFyZ2U6IG51bSh4LnRvdGFsKSwgY3JlZGl0OiAwIH0pKSwKICAgIC4uLnJldC5tYXAoKHgpID0+ICh7IGRhdGU6IHguY3JlYXRlZEF0LCB0eXBlOiAnUHVyY2hhc2UgcmV0dXJuJywgcmVmOiAnUFItJyArIHguaWQsIG5vdGU6IHgucmVhc29uLCBjaGFyZ2U6IDAsIGNyZWRpdDogbnVtKHgudG90YWwpIH0pKSwKICAgIC4uLnBheS5tYXAoKHgpID0+ICh7IGRhdGU6IHgucGFpZEF0LCB0eXBlOiAnUGF5bWVudCAoJyArIHgubWV0aG9kICsgJyknLCByZWY6IHgucmVmZXJlbmNlIHx8ICdQQVktJyArIHguaWQsIG5vdGU6IHgubm90ZSB8fCAnJywgY2hhcmdlOiAwLCBjcmVkaXQ6IG51bSh4LmFtb3VudCkgfSkpLAogIF0uc29ydCgoYSwgYikgPT4gK25ldyBEYXRlKGEuZGF0ZSkgLSArbmV3IERhdGUoYi5kYXRlKSk7CiAgbGV0IGJhbCA9IDA7CiAgcm93cy5mb3JFYWNoKCh4KSA9PiB7IGJhbCArPSB4LmNoYXJnZSAtIHguY3JlZGl0OyB4LmJhbGFuY2UgPSBiYWw7IH0pOwogIHJlcy5qc29uKHsgc3VwcGxpZXI6IHsgaWQ6IHN1cHBsaWVyLmlkLCBuYW1lOiBzdXBwbGllci5uYW1lLCBwaG9uZTogc3VwcGxpZXIucGhvbmUgfSwgcm93cywgYmFsYW5jZTogYmFsIH0pOwp9KSk7CgovLyAtLS0tLS0tLS0tIFJlY29yZCBhIHBheW1lbnQgdG8gYSBzdXBwbGllciAtLS0tLS0tLS0tCnIucG9zdCgnL3BheWFibGVzLzppZC9wYXltZW50cycsIGF1dGgoLi4uUEFZKSwgd3JhcChhc3luYyAocmVxOiBhbnksIHJlczogYW55KSA9PiB7CiAgY29uc3QgaWQgPSBOdW1iZXIocmVxLnBhcmFtcy5pZCk7CiAgY29uc3QgYiA9IHoub2JqZWN0KHsKICAgIGFtb3VudDogei5udW1iZXIoKS5wb3NpdGl2ZSgpLCBtZXRob2Q6IHouZW51bShbJ0NBU0gnLCAnQ0FSRCcsICdCQU5LJywgJ09USEVSJ10pLmRlZmF1bHQoJ0JBTksnKSwKICAgIHJlZmVyZW5jZTogei5zdHJpbmcoKS5tYXgoODApLm9wdGlvbmFsKCksIG5vdGU6IHouc3RyaW5nKCkubWF4KDIwMCkub3B0aW9uYWwoKSwgcGFpZEF0OiB6LnN0cmluZygpLm9wdGlvbmFsKCksCiAgfSkucGFyc2UocmVxLmJvZHkpOwogIGlmICghKGF3YWl0IHByaXNtYS5zdXBwbGllci5maW5kVW5pcXVlKHsgd2hlcmU6IHsgaWQgfSB9KSkpIHRocm93IG5ldyBIdHRwRXJyb3IoNDA0LCAnU3VwcGxpZXIgbm90IGZvdW5kJyk7CiAgY29uc3QgcCA9IGF3YWl0IHByaXNtYS5zdXBwbGllclBheW1lbnQuY3JlYXRlKHsKICAgIGRhdGE6IHsgc3VwcGxpZXJJZDogaWQsIGJyYW5jaElkOiByZXEudXNlci5icmFuY2hJZCwgdXNlcklkOiByZXEudXNlci5pZCwgYW1vdW50OiBEKGIuYW1vdW50KSwgbWV0aG9kOiBiLm1ldGhvZCwgcmVmZXJlbmNlOiBiLnJlZmVyZW5jZSwgbm90ZTogYi5ub3RlLCBwYWlkQXQ6IGIucGFpZEF0ID8gbmV3IERhdGUoYi5wYWlkQXQpIDogbmV3IERhdGUoKSB9LAogIH0pOwogIGF3YWl0IGF1ZGl0KHJlcSwgJ0NSRUFURScsICdTdXBwbGllclBheW1lbnQnLCBwLmlkLCB7IHN1cHBsaWVySWQ6IGlkLCBhbW91bnQ6IGIuYW1vdW50LCBtZXRob2Q6IGIubWV0aG9kIH0pOwogIHJlcy5qc29uKHApOwp9KSk7CgovLyAtLS0tLS0tLS0tIFB1cmNoYXNlIHJldHVybnMgKHN0b2NrIGxlYXZlcywgc3VwcGxpZXIgYmFsYW5jZSBkZWNyZWFzZXMpIC0tLS0tLS0tLS0Kci5nZXQoJy9wdXJjaGFzZS1yZXR1cm5zJywgYXV0aCguLi5WSUVXKSwgd3JhcChhc3luYyAocmVxOiBhbnksIHJlczogYW55KSA9PiB7CiAgcmVzLmpzb24oYXdhaXQgcHJpc21hLnB1cmNoYXNlUmV0dXJuLmZpbmRNYW55KHsKICAgIHdoZXJlOiB7IGJyYW5jaElkOiByZXEudXNlci5icmFuY2hJZCB9LCBvcmRlckJ5OiB7IGlkOiAnZGVzYycgfSwgdGFrZTogMTAwLAogICAgaW5jbHVkZTogeyBzdXBwbGllcjogeyBzZWxlY3Q6IHsgbmFtZTogdHJ1ZSB9IH0sIGl0ZW1zOiB7IGluY2x1ZGU6IHsgYmF0Y2g6IHsgc2VsZWN0OiB7IGJhdGNoTm86IHRydWUsIGV4cGlyeURhdGU6IHRydWUsIG1lZGljaW5lOiB7IHNlbGVjdDogeyBuYW1lOiB0cnVlLCBzdHJlbmd0aDogdHJ1ZSB9IH0gfSB9IH0gfSB9LAogIH0pKTsKfSkpOwoKci5wb3N0KCcvcHVyY2hhc2UtcmV0dXJucycsIGF1dGgoLi4uUkVUVVJOKSwgd3JhcChhc3luYyAocmVxOiBhbnksIHJlczogYW55KSA9PiB7CiAgY29uc3QgYiA9IHoub2JqZWN0KHsKICAgIHN1cHBsaWVySWQ6IHoubnVtYmVyKCkuaW50KCksIHJlYXNvbjogei5zdHJpbmcoKS5taW4oMykubWF4KDIwMCksCiAgICBpdGVtczogei5hcnJheSh6Lm9iamVjdCh7IGJhdGNoSWQ6IHoubnVtYmVyKCkuaW50KCksIHF0eTogei5udW1iZXIoKS5pbnQoKS5wb3NpdGl2ZSgpIH0pKS5taW4oMSkubWF4KDUwKSwKICB9KS5wYXJzZShyZXEuYm9keSk7CiAgY29uc3QgYnJhbmNoSWQgPSByZXEudXNlci5icmFuY2hJZDsKICBjb25zdCBjcmVhdGVkID0gYXdhaXQgcHJpc21hLiR0cmFuc2FjdGlvbihhc3luYyAodHgpID0+IHsKICAgIGlmICghKGF3YWl0IHR4LnN1cHBsaWVyLmZpbmRVbmlxdWUoeyB3aGVyZTogeyBpZDogYi5zdXBwbGllcklkIH0gfSkpKSB0aHJvdyBuZXcgSHR0cEVycm9yKDQwNCwgJ1N1cHBsaWVyIG5vdCBmb3VuZCcpOwogICAgY29uc3QgbWVyZ2VkID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTsKICAgIGIuaXRlbXMuZm9yRWFjaCgoaSkgPT4gbWVyZ2VkLnNldChpLmJhdGNoSWQsIChtZXJnZWQuZ2V0KGkuYmF0Y2hJZCkgfHwgMCkgKyBpLnF0eSkpOwogICAgY29uc3QgYmF0Y2hlcyA9IGF3YWl0IHR4LmJhdGNoLmZpbmRNYW55KHsgd2hlcmU6IHsgaWQ6IHsgaW46IFsuLi5tZXJnZWQua2V5cygpXSB9LCBicmFuY2hJZCB9IH0pOwogICAgaWYgKGJhdGNoZXMubGVuZ3RoICE9PSBtZXJnZWQuc2l6ZSkgdGhyb3cgbmV3IEh0dHBFcnJvcig0MDAsICdPbmUgb2YgdGhlIHNlbGVjdGVkIGJhdGNoZXMgd2FzIG5vdCBmb3VuZCcpOwogICAgbGV0IHRvdGFsID0gRCgwKTsKICAgIGNvbnN0IHJvd3M6IGFueVtdID0gW107CiAgICBmb3IgKGNvbnN0IGJ0IG9mIGJhdGNoZXMpIHsKICAgICAgY29uc3QgcXR5ID0gbWVyZ2VkLmdldChidC5pZCkhOwogICAgICBhd2FpdCB0YWtlRnJvbUJhdGNoKHR4LCBidC5pZCwgcXR5KTsgLy8gYXRvbWljOiBzdG9jayBjYW4gbmV2ZXIgZ28gbmVnYXRpdmUKICAgICAgdG90YWwgPSB0b3RhbC5hZGQoYnQuY29zdFByaWNlLm11bChxdHkpKTsKICAgICAgcm93cy5wdXNoKHsgYmF0Y2hJZDogYnQuaWQsIG1lZGljaW5lSWQ6IGJ0Lm1lZGljaW5lSWQsIHF0eSwgdW5pdENvc3Q6IGJ0LmNvc3RQcmljZSB9KTsKICAgIH0KICAgIGNvbnN0IHJldCA9IGF3YWl0IHR4LnB1cmNoYXNlUmV0dXJuLmNyZWF0ZSh7CiAgICAgIGRhdGE6IHsgc3VwcGxpZXJJZDogYi5zdXBwbGllcklkLCBicmFuY2hJZCwgdXNlcklkOiByZXEudXNlci5pZCwgcmVhc29uOiBiLnJlYXNvbiwgdG90YWw6IHRvdGFsLnRvRGVjaW1hbFBsYWNlcygyKSwgaXRlbXM6IHsgY3JlYXRlOiByb3dzLm1hcCgoeCkgPT4gKHsgYmF0Y2hJZDogeC5iYXRjaElkLCBxdHk6IHgucXR5LCB1bml0Q29zdDogeC51bml0Q29zdCB9KSkgfSB9LAogICAgfSk7CiAgICBhd2FpdCB0eC5zdG9ja01vdmVtZW50LmNyZWF0ZU1hbnkoewogICAgICBkYXRhOiByb3dzLm1hcCgoeCkgPT4gKHsgYmF0Y2hJZDogeC5iYXRjaElkLCBtZWRpY2luZUlkOiB4Lm1lZGljaW5lSWQsIGJyYW5jaElkLCB0eXBlOiAnQURKVVNUX09VVCcgYXMgY29uc3QsIHF0eTogLXgucXR5LCByZWFzb246ICdQdXJjaGFzZSByZXR1cm46ICcgKyBiLnJlYXNvbiwgcmVmVHlwZTogJ1BVUkNIQVNFX1JFVFVSTicsIHJlZklkOiByZXQuaWQsIHVzZXJJZDogcmVxLnVzZXIuaWQgfSkpLAogICAgfSk7CiAgICByZXR1cm4gcmV0OwogIH0pOwogIGF3YWl0IGF1ZGl0KHJlcSwgJ0NSRUFURScsICdQdXJjaGFzZVJldHVybicsIGNyZWF0ZWQuaWQsIHsgc3VwcGxpZXJJZDogYi5zdXBwbGllcklkLCB0b3RhbDogU3RyaW5nKGNyZWF0ZWQudG90YWwpIH0pOwogIHJlcy5qc29uKGNyZWF0ZWQpOwp9KSk7Cg=="};
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

const APPENDS = [];
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

patchFile('src/app.ts', [
  { label: 'import', skipIf: "routes/payables", re: /^import \{ r as storeR \} from '\.\/routes\/store';.*$/m, add: "\nimport { r as payablesR } from './routes/payables';", manual: "import { r as payablesR } from './routes/payables';" },
  { label: 'mount', skipIf: 'payablesR]', re: /storeR(, toolsR)?\]/, sub: (m) => m.replace(']', ', payablesR]'), manual: 'add payablesR to the array of routers in the api.use(...) line' },
]);
patchFile('prisma/schema.prisma', [
  { label: 'Supplier relations', skipIf: 'SupplierPayment[]', re: /^model Supplier \{.*$/m, add: "\n  payments        SupplierPayment[]\n  purchaseReturns PurchaseReturn[]", manual: 'inside model Supplier add: payments SupplierPayment[] and purchaseReturns PurchaseReturn[]' },
  { label: 'Batch relations', skipIf: 'purchaseReturnItems', re: /^model Batch \{.*$/m, add: "\n  purchaseReturnItems PurchaseReturnItem[]", manual: 'inside model Batch add: purchaseReturnItems PurchaseReturnItem[]' },
]);
{
  const sp = path.join(ROOT, 'prisma/schema.prisma');
  if (fs.existsSync(sp)) {
    const cur = fs.readFileSync(sp, 'utf8');
    if (!cur.includes('model SupplierPayment')) {
      const b = path.join(bak, 'prisma/schema.prisma');
      if (!fs.existsSync(b)) { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.writeFileSync(b, cur); backedUp++; }
      fs.writeFileSync(sp, cur + (cur.endsWith('\n') ? '' : '\n') + "\n// ---- Phase 3: supplier accounts and purchase returns ----\nmodel SupplierPayment {\n  id          Int       @id @default(autoincrement())\n  supplierId  Int\n  supplier    Supplier  @relation(fields: [supplierId], references: [id])\n  branchId    Int\n  userId      Int\n  amount      Decimal   @db.Decimal(12, 2)\n  method      PayMethod @default(BANK)\n  reference   String?\n  note        String?\n  paidAt      DateTime  @default(now())\n  createdAt   DateTime  @default(now())\n\n  @@index([supplierId])\n}\n\nmodel PurchaseReturn {\n  id         Int                  @id @default(autoincrement())\n  supplierId Int\n  supplier   Supplier             @relation(fields: [supplierId], references: [id])\n  branchId   Int\n  userId     Int\n  reason     String\n  total      Decimal              @db.Decimal(12, 2)\n  createdAt  DateTime             @default(now())\n  items      PurchaseReturnItem[]\n\n  @@index([supplierId])\n}\n\nmodel PurchaseReturnItem {\n  id       Int            @id @default(autoincrement())\n  returnId Int\n  ret      PurchaseReturn @relation(fields: [returnId], references: [id])\n  batchId  Int\n  batch    Batch          @relation(fields: [batchId], references: [id])\n  qty      Int\n  unitCost Decimal        @db.Decimal(12, 2)\n}\n");
      written++;
      console.log('Added new models to prisma/schema.prisma');
    }
  }
}
console.log('\nNEXT STEPS (database): 1) stop the backend (Ctrl+C)  2) npx prisma migrate dev --name supplier_accounts  3) restart the backend.');

console.log('Update complete: ' + written + ' files written/updated, ' + backedUp + ' old files backed up to ' + bak);
console.log('Done. IMPORTANT: run the database migration (see NEXT STEPS above) before starting the backend.');
