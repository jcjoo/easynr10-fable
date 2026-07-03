import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { schema } from '@easynr10/db';
import { db } from './db';
import { env } from './env';

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.FRONTEND_URL],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    // Cópia assinada da sessão em cookie de vida curta: o getSession de cada
    // request tRPC resolve sem consultar o banco. Revogação demora até maxAge.
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined,
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'client',
        input: false,
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
