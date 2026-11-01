import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || '',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
};

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL .env mein nahi mili. .env.example ko copy karke .env banayein.');
  process.exit(1);
}
if (config.jwtSecret.length < 32) {
  console.error('JWT_SECRET .env mein kam az kam 32 characters ka hona chahiye.');
  process.exit(1);
}
