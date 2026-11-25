# VIP Pharmacy POS — Web Application

React · TypeScript · Vite

- **Customers:** `/` — online shop (Cash on Delivery, order tracking)
- **Staff:** `/staff` — POS, inventory, purchasing, reports and administration

## Run locally
```
npm install
npm run dev
```
Create `.env` with `VITE_API_URL=http://localhost:4000/api/v1` (the backend must be running).

## Build for production
```
npm run build
```
Deploy the `dist` folder, or connect the repository to Vercel with **Root Directory** `vip-pharmacy-frontend` and the environment variable `VITE_API_URL`. See `vip-pharmacy-backend/docs/DEPLOYMENT.md`.

## Notes
- Receipts print through the browser (80 mm thermal or A4).
- Held bills are stored in the browser of the computer used.
- Keyboard shortcuts at the POS: `F2` search, `F9` complete sale.
