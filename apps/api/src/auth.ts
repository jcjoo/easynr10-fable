import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { schema } from '@easynr10/db';
import { db } from './db';
import { env } from './env';

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [
    env.FRONTEND_URL,
    ...(env.EXTRA_TRUSTED_ORIGINS?.split(',').map((origin) => origin.trim()) ?? []),
  ],
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
  // Rate limit SEMPRE ligado (o padrão do better-auth só liga em produção,
  // e o compose não define NODE_ENV): teto por IP contra força bruta, com o
  // login por senha mais estrito. Armazenamento em memória basta para uma
  // instância; multi-instância exigiria secondaryStorage.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 120,
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
    },
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
    // Configurações → perfil: trocar o próprio e-mail (sem verificação por
    // ora — o envio de e-mail entra com o RNF de notificações).
    changeEmail: {
      enabled: true,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
