# Deployment guide (Vercel + Neon)

## 1. Database (Neon)
1. Create a project at neon.tech and copy the connection strings.
   - **Pooled** string (host contains `-pooler`) → used by the live backend.
   - **Direct** string (pooling off) → used only for running migrations from your computer.
2. Keep the Neon region close to the Vercel function region (Singapore ↔ `sin1`). This project's `vercel.json` sets `"regions": ["sin1"]`; change it if your database is elsewhere.

## 2. Backend on Vercel
1. Push the repository to GitHub.
2. Vercel → *Add New → Project* → choose the repository.
3. **Root Directory:** `vip-pharmacy-backend` · **Framework Preset:** Other.
4. Environment variables: `DATABASE_URL` (pooled), `JWT_SECRET`, `CORS_ORIGIN` (the frontend address).
5. Deploy, then open `https://YOUR-BACKEND.vercel.app/api/v1/health`.

## 3. Database migrations
Run from `vip-pharmacy-backend` whenever the schema changes (Windows Command Prompt):
```
set "DATABASE_URL=<direct connection string ending ?sslmode=require>"
npx prisma migrate deploy
set DATABASE_URL=
```
Always run migrations **before** deploying code that needs them.

## 4. Frontend on Vercel
1. *Add New → Project* → same repository.
2. **Root Directory:** `vip-pharmacy-frontend`.
3. Environment variable: `VITE_API_URL` = `https://YOUR-BACKEND.vercel.app/api/v1`.
4. After the first deploy, set the backend's `CORS_ORIGIN` to the frontend address and redeploy the backend.

## 5. Go-live checklist
- [ ] Owner account created with a strong password
- [ ] Store name, address, phone and receipt footer set in *Staff & Settings*
- [ ] Demo medicines removed or archived
- [ ] Online store enabled only after legal/regulatory confirmation
- [ ] First backup taken and restore tested (see `BACKUP_RESTORE.md`)
- [ ] `.env` and `backups/` are not in Git
