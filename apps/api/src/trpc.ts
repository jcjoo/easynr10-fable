import { TRPCError, initTRPC } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@easynr10/db';
import { unitActions, type UnitAction } from '@easynr10/shared';
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

// "Decorators" de permissão: cada endpoint é construído a partir do builder
// da permissão que exige — a permissão fica explícita na definição e vira
// metadado enumerável (matriz gerada por `bun run permissions`).
export type Permission = 'publica' | 'autenticado' | 'admin' | 'membro-da-unidade';

export interface Meta {
  permission: Permission;
  /** Ação de escrita exigida do PAPEL do usuário na unidade (unitActions). */
  action?: UnitAction;
}

const t = initTRPC.context<Context>().meta<Meta>().create();

export const router = t.router;
export const publicProcedure = t.procedure.meta({ permission: 'publica' });

export const protectedProcedure = t.procedure
  .meta({ permission: 'autenticado' })
  .use(({ ctx, next }) => {
    if (!ctx.session) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return next({ ctx: { ...ctx, session: ctx.session } });
  });

// Somente consultores PSO (RF03).
export const adminProcedure = protectedProcedure
  .meta({ permission: 'admin' })
  .use(({ ctx, next }) => {
    if (ctx.session.user.role !== 'admin') {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return next();
  });

// Isolamento multi-tenant no servidor (RNF02): toda procedure de unidade
// recebe unitId e só prossegue se o usuário for admin ou membro da unidade.
// O PAPEL do membro (app_role) entra no ctx como o conjunto de ações de
// escrita permitidas; admin tem todas. Leitura = ser membro basta.
export const unitProcedure = protectedProcedure
  .meta({ permission: 'membro-da-unidade' })
  .input(z.object({ unitId: z.uuid() }))
  .use(async ({ ctx, input, next }) => {
    if (ctx.session.user.role === 'admin') {
      return next({ ctx: { ...ctx, unitPermissions: new Set<string>(unitActions) } });
    }
    const [member] = await db
      .select({ permissions: schema.appRole.permissions })
      .from(schema.membership)
      .leftJoin(schema.appRole, eq(schema.membership.roleId, schema.appRole.id))
      .where(
        and(
          eq(schema.membership.unitId, input.unitId),
          eq(schema.membership.userId, ctx.session.user.id),
          isNull(schema.membership.deletedAt),
        ),
      );
    if (!member) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a esta unidade' });
    }
    return next({ ctx: { ...ctx, unitPermissions: new Set(member.permissions ?? []) } });
  });

// "Decorator" de ação: além de membro, o papel do usuário na unidade precisa
// mapear a ação (ex.: unitAction('pie.manage') nas mutations do prontuário).
export const unitAction = (action: UnitAction) =>
  unitProcedure.meta({ permission: 'membro-da-unidade', action }).use(({ ctx, next }) => {
    if (!ctx.unitPermissions.has(action)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Seu papel nesta unidade não permite esta ação',
      });
    }
    return next();
  });
