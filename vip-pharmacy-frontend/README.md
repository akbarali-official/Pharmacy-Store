# VIP Pharmacy POS — FRONTEND (React + TypeScript + Vite)

Do hisse ek hi website mein:
- **`/`** — customers ki online shop (bina login).
- **`/staff`** — dukaan ka POS (login/owner setup).

## Chalana (Windows)
1. Node.js 20/22 LTS install karein. **Pehle backend chalayein** (uska README dekhein).
2. `.env.example` → `.env`; `VITE_API_URL` backend ka address ho (local: `http://localhost:4000/api/v1`).
3. Terminal is folder mein:
   ```
   npm install
   npm run dev
   ```
   Ya `1-install.bat` phir `2-start.bat`.
4. http://localhost:5173/staff → pehli dafa **Owner account** banayein. Phir Settings mein dukaan ki details bharein.
5. Online shop dikhane ke liye: Staff & Settings → Dukaan settings → "Online store chalu karein" (qanooni tasdeeq ke baad) aur Medicines mein "Online store mein dikhayen" tick karein.

## Customer ko dena (production)
1. `.env` mein `VITE_API_URL` = asli backend ka HTTPS address (jaise `https://api.dukaan.com/api/v1`).
2. `npm run build` → `dist` folder banega. Yahi folder kisi bhi web hosting par rakhein.
3. **Zaroori:** hosting par "sab raaste index.html par bhejo" (SPA fallback) lagayein, warna `/staff` refresh par 404 aayega (Netlify: `_redirects` mein `/* /index.html 200`; Nginx: `try_files $uri /index.html;`).
4. Backend ke `CORS_ORIGIN` mein is website ka address daalein.

## Receipt print
POS bill ke baad "Print" dabayen — browser print dialog khulta hai (80mm thermal ya A4). Direct printer integration nahi hai.

## Tasdeeq ka status
Syntax check hua hai, lekin `npm install`/browser is code ko banate waqt available nahi tha, is liye pehli dafa chalane par chhoti ghaltiyan nikal sakti hain. `npm run typecheck` aur `npm run build` chala kar error bhej dein.
