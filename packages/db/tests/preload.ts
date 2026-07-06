// Ambiente dos testes (bunfig [test].preload — roda ANTES de qualquer import
// dos arquivos de teste): recria um banco descartável `easynr10_test` na
// infra de dev (docker-compose.dev, porta 5433), aplica as migrations e
// aponta DATABASE_URL para ele. O MinIO usado é o da stack local (.env) —
// os testes só tocam prefixos units/<uuid-aleatório>/.
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { createDb } from '@easynr10/db';

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  throw new Error('DATABASE_URL não definida — os testes usam a infra de dev (.env).');
}

const TEST_DB = 'easynr10_test';
const testUrl = new URL(baseUrl);
testUrl.pathname = `/${TEST_DB}`;

// Recria o banco do zero a cada execução (estado determinístico), conectado
// ao banco de dev. Espera o Postgres aceitar conexões (container subindo).
const admin = createDb(baseUrl);
for (let attempt = 1; ; attempt += 1) {
  try {
    await admin.execute(sql`SELECT 1`);
    break;
  } catch (error) {
    if (attempt >= 20) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
await admin.execute(sql.raw(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`));
await admin.execute(sql.raw(`CREATE DATABASE ${TEST_DB}`));

process.env.DATABASE_URL = testUrl.toString();

const db = createDb(process.env.DATABASE_URL);
const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
await migrate(db, { migrationsFolder });
