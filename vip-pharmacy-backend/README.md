# VIP Pharmacy POS — Backend API

Node.js · Express · TypeScript · PostgreSQL · Prisma

A point-of-sale, inventory and online-orders system for pharmacies. This folder is the **API**. The web application lives in `vip-pharmacy-frontend`.

## Features
- Secure staff login with role-based access (Owner, Manager, Pharmacist, Cashier, Inventory, Accountant)
- Medicines, categories, batches and expiry tracking, with first-expiry-first-out (FEFO) stock allocation
- POS billing in a single database transaction (stock can never go negative, expired stock is never sold)
- Returns and refunds, cash register sessions with variance, expenses
- Suppliers, purchases, supplier accounts (payables, payments, statements) and purchase returns
- Reports, daily closing report, reorder list, expiry report, CSV import/export
- Public online store with Cash-on-Delivery orders and order tracking
- Audit log of sensitive actions

## Quick start (local)
1. Install Node.js 20+ and PostgreSQL 15+.
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `JWT_SECRET` (32+ random characters) and `CORS_ORIGIN`.
3. Install and migrate:
   ```
   npm install
   npx prisma migrate deploy
   npm run dev
   ```
4. Open `http://localhost:4000/api/v1/health` — you should see `{"ok":true}`.
5. Open the frontend and create the owner account on first run.

## Environment variables
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign login tokens (32+ characters, keep private) |
| `CORS_ORIGIN` | Allowed website address(es), comma separated, no trailing slash |
| `PORT` | Local port (default 4000) |

## Deployment
See `docs/DEPLOYMENT.md` (Vercel + Neon) and `docs/BACKUP_RESTORE.md`.

## Roles
| Role | Can do |
|---|---|
| Owner | Everything, including staff, settings and audit log |
| Manager | Everything except staff passwords and store settings |
| Pharmacist | Billing, medicines, stock, prescription medicines |
| Cashier | Billing, own sales, cash session |
| Inventory | Medicines, stock, purchases, imports |
| Accountant | Reports, expenses, supplier accounts, exports |

## Scripts
`npm run dev` · `npm start` · `npm run backup` · `npm run db:deploy` · `npm run db:seed` (demo data only)
