import { config } from './config';
import { app } from './app';
import { prisma } from './db';

process.on('unhandledRejection', (e: any) => console.error('Unhandled:', e?.message || e));

async function main() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.error('Cannot connect to the database. Is PostgreSQL running, and is DATABASE_URL in .env correct?');
    process.exit(1);
  }
  const server = app.listen(config.port, () => {
    console.log(`VIP Pharmacy API is running: http://localhost:${config.port}/api/v1/health`);
  });
  const stop = async () => {
    console.log('Shutting down server…');
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
main();
