// Aplica as migrations SQL geradas pelo drizzle-kit (uso: dev e container).
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { createDb } from './index';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL não definida');
  process.exit(1);
}

const db = createDb(databaseUrl);
const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

await migrate(db, { migrationsFolder });
console.log('Migrations aplicadas.');
process.exit(0);
