# VIP Pharmacy POS — BACKEND (Node + Express + TypeScript + PostgreSQL + Prisma)

Mashallah Medical Store. Yeh pack sirf **server/API** hai. Frontend alag pack hai (`vip-pharmacy-frontend`).

## Zaroorat (Windows)
1. **Node.js 20 ya 22 LTS** — https://nodejs.org
2. **PostgreSQL 15/16** — https://www.postgresql.org/download/windows/ (install ke waqt `postgres` user ka password yaad rakhein; port 5432)
3. Ek khali database banayein: pgAdmin kholein → Databases → Create → naam `vip_pharmacy`.

## Pehli dafa chalana
1. `.env.example` ko copy karke `.env` banayein (ya `1-install.bat` khud bana dega) aur bharein:
   - `DATABASE_URL` mein `YOUR_PG_PASSWORD` ki jagah apna PostgreSQL password.
   - `JWT_SECRET` — kam az kam 32 random characters (har customer ke liye alag).
   - `CORS_ORIGIN` — frontend ka address (local par `http://localhost:5173`).
2. Is folder mein terminal kholein (VS Code: Terminal → New Terminal) aur:
   ```
   npm install
   npx prisma migrate dev --name init
   npm run db:seed        # OPTIONAL: sirf demo dawaiyan (test ke liye)
   npm run dev
   ```
   Ya Windows par `1-install.bat` phir `2-start.bat` double-click karein.
3. Check: browser mein http://localhost:4000/api/v1/health → `{"ok":true,...}`.
4. Frontend kholein → pehli screen par **Owner account** banayein (password hardcoded nahi hai).

## Production / customer ko dena
- `npm run db:deploy` (migrations lagane ke liye; `migrate dev` sirf development ke liye).
- `npm start` se chalayein (pm2 ya Windows service ke zariye taake band na ho).
- HTTPS zaroori hai (reverse proxy: Nginx/Caddy/IIS). `CORS_ORIGIN` mein sirf asli website ka address rakhein.
- Roz backup: `pg_dump -U postgres -F c -f backup_%date%.dump vip_pharmacy`
  Restore: `pg_restore -U postgres -d vip_pharmacy_new --clean backup.dump`
  (Restore kisi nayi/khali database par pehle test karein.)
- ⚠ `npx prisma migrate reset` **saara data mita deta hai** — kabhi live database par na chalayein.

## Kya kya bana hai
Login/roles (OWNER, MANAGER, PHARMACIST, CASHIER, INVENTORY, ACCOUNTANT — har route par server check), medicines/categories, batches + expiry, FEFO stock, stock movements + adjustments (wajah lazmi), POS checkout (ek transaction, oversell se mehfooz, expire stock nahi bikta), invoice numbering, returns/refunds, suppliers + purchases (receive se stock), customers, expenses, cash register (open/close, variance), dashboard, reports + CSV, audit log, settings, public online store + online orders (COD) with order tracking.

## API (sab `/api/v1` ke neeche)
`/auth/*`, `/users`, `/settings`, `/branches`, `/audit`, `/categories`, `/medicines`, `/pos/search`, `/pos/checkout`, `/sales`, `/sales/:id/return`, `/inventory/*`, `/suppliers`, `/purchases`, `/customers`, `/expenses`, `/cash/*`, `/reports/*`, `/store/*` (public), `/orders`.

## Abhi shamil NAHI (honest list)
Multi-tenant SaaS/subscriptions/plans, multiple branches ka UI aur branch-to-branch stock transfer (schema branch-ready hai), prescription upload/review, online payment gateways, SMS/email/WhatsApp, password-reset email, MFA, line-level discount aur split-tender UI, purchase returns/supplier payments, stock count sheets, automated tests. Online dawai farokht ka qanooni jaiza aap ko khud karwana hoga — store settings mein default **band** hai.

## Tasdeeq ka status
Code ka syntax check hua hai, lekin is code ko banate waqt npm install / database / browser available nahi tha, is liye **abhi tak asal chalaya nahi gaya**. Pehli dafa chalane par koi error aaye to error ka text bhej dein, theek kar diya jayega. Test se pehle live dukaan par na lagayein.
