import { TRPCError, initTRPC } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { z } from 'zod';
import { db } from './db';
import { auth } from './auth';

export interface Context {
  session: Awaited<ReturnType<typeof auth.api.getSession>>;
}

export async function createContext(headers: Headers): Promise<Context> {
  const session = await auth.api.getSession({ headers });
  return { session };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

// Somente consultores PSO (RF03).
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});

// Isolamento multi-tenant no servidor (RNF02): toda procedure de unidade
// recebe unitId e só prossegue se o usuário for admin ou membro da unidade.
export const unitProcedure = protectedProcedure
  .input(z.object({ unitId: z.uuid() }))
  .use(async ({ ctx, input, next }) => {
    if (ctx.session.user.role !== 'admin') {
      const member = await db.query.membership.findFirst({
        where: and(
          eq(schema.membership.unitId, input.unitId),
          eq(schema.membership.userId, ctx.session.user.id),
          isNull(schema.membership.deletedAt),
        ),
      });
      if (!member) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta unidade' });
      }
    }
    return next();
  });
