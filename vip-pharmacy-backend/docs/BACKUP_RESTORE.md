# Backup and restore

Your data is your customer's business. Back it up.

## Backups
- **Manual (any PostgreSQL):** `npm run backup` creates a compressed dump in `backups/` and keeps the last 14. Requires `pg_dump` on your PATH.
- **Neon:** the free plan has a short history window; check *Backups / Restore* in the Neon console and consider a paid plan for point-in-time restore on live customers.
- Store copies **off the computer** (USB drive or cloud storage). Never commit `backups/` to Git.

## Restore
1. Create a new, empty database (do **not** restore over live data to test it).
2. `pg_restore -d "<connection string>" --clean --no-owner backups/<file>.dump`
3. Point a test copy of the app at the restored database and check medicines, stock and recent sales.

## Routine
- Daily: backup after closing the cash register.
- Monthly: restore the latest backup to a scratch database to prove it works.
