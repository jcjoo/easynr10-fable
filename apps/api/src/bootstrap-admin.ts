import { eq } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { db } from './db';
import { auth } from './auth';
import { env } from './env';

// Admin inicial: criado via better-auth (hash de senha correto) apenas
// quando o banco não tem NENHUM usuário — bancos existentes nunca são
// tocados. Roda no boot da API (main.ts), antes do serve.
export async function bootstrapAdmin() {
  const anyUser = await db.query.user.findFirst({ columns: { id: true } });
  if (anyUser) return;

  await auth.api.signUpEmail({
    body: { name: 'Admin', email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  await db
    .update(schema.user)
    .set({ role: 'admin' })
    .where(eq(schema.user.email, env.ADMIN_EMAIL));
  console.log(`Bootstrap: admin "${env.ADMIN_EMAIL}" criado (senha via ADMIN_PASSWORD).`);
}
