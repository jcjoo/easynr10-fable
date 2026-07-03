import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  // Same-origin via proxy do Vite em dev.
  baseURL: window.location.origin,
  // Espelha os additionalFields do servidor (apps/api/src/auth.ts).
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: 'string', input: false },
      },
    }),
  ],
});

export const { useSession, signIn, signOut } = authClient;
