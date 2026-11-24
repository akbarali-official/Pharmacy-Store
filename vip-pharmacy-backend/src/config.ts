import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || '',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
};

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL was not found in .env. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
if (config.jwtSecret.length < 32) {
  console.error('JWT_SECRET in .env must be at least 32 characters long.');
  process.exit(1);
}
