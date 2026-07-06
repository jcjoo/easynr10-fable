import { TRPCError } from '@trpc/server';
import { and, asc, count, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { notDeleted, schema, type Db } from '@easynr10/db';
import { unitActions, userRoles } from '@easynr10/shared';
import { z } from 'zod';
import { auth } from '../auth';
import { adminProcedure, router } from '../trpc';

const { appRole, user, membership, unit, company } = schema;

// Painel de usuários (admin): criar usuários, gerenciar papéis (mapeamento
// de permissões) e liberar/revogar acesso a unidades com um papel (RF03/RF04).
export const usersRouter = router({
  // Usuários com o resumo dos papéis de unidade (ex.: Gestor ×2, Leitor ×1).
  list: adminProcedure.query(async ({ ctx }) => {
    const users = await ctx.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(asc(user.name));

    const links = await ctx.db
      .select({ userId: membership.userId, roleName: appRole.name })
      .from(membership)
      .innerJoin(appRole, eq(membership.roleId, appRole.id))
      .innerJoin(unit, eq(membership.unitId, unit.id))
      .where(and(notDeleted(membership), notDeleted(unit)));
    const byUser = new Map<string, Map<string, number>>();
    for (const link of links) {
      const roles = byUser.get(link.userId) ?? new Map<string, number>();
      roles.set(link.roleName, (roles.get(link.roleName) ?? 0) + 1);
      byUser.set(link.userId, roles);
    }

    return users.map((row) => ({
      ...row,
      unitRoles: [...(byUser.get(row.id) ?? new Map<string, number>())].map(
        ([name, units]) => ({ name, units }),
      ),
    }));
  }),

  // Usuários de UMA empresa (têm vínculo em alguma unidade dela), com o
  // resumo dos papéis naquela empresa — painel de usuários da empresa.
  listByCompany: adminProcedure
    .input(z.object({ companyId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const links = await ctx.db
        .select({
          userId: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
          roleName: appRole.name,
        })
        .from(membership)
        .innerJoin(unit, eq(membership.unitId, unit.id))
        .innerJoin(user, eq(membership.userId, user.id))
        .innerJoin(appRole, eq(membership.roleId, appRole.id))
        .where(
          and(
            eq(unit.companyId, input.companyId),
            notDeleted(membership),
            notDeleted(unit),
          ),
        );
      const byUser = new Map<
        string,
        { id: string; name: string; email: string; role: string; createdAt: Date; roles: Map<string, number> }
      >();
      for (const link of links) {
        const entry = byUser.get(link.userId) ?? {
          id: link.userId,
          name: link.name,
          email: link.email,
          role: link.role,
          createdAt: link.createdAt,
          roles: new Map<string, number>(),
        };
        entry.roles.set(link.roleName, (entry.roles.get(link.roleName) ?? 0) + 1);
        byUser.set(link.userId, entry);
      }
      return [...byUser.values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map(({ roles, ...row }) => ({
          ...row,
          unitRoles: [...roles].map(([name, units]) => ({ name, units })),
        }));
    }),

  // Cria um usuário JÁ vinculado a unidades de uma empresa, com papel —
  // fluxo do painel de usuários da empresa (papel global sempre client).
  createForCompany: adminProcedure
    .input(
      z.object({
        companyId: z.uuid(),
        name: z.string().trim().min(2).max(255),
        email: z.email(),
        password: z.string().min(8).max(128),
        roleId: z.uuid(),
        unitIds: z.array(z.uuid()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = await findActiveRole(ctx.db, input.roleId);
      if (role.companyId && role.companyId !== input.companyId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Papel de outra empresa' });
      }
      const units = await ctx.db
        .select({ id: unit.id, companyId: unit.companyId })
        .from(unit)
        .where(and(inArray(unit.id, input.unitIds), notDeleted(unit)));
      if (units.length !== input.unitIds.length || units.some((row) => row.companyId !== input.companyId)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unidade de outra empresa' });
      }
      const result = await auth.api
        .signUpEmail({
          body: { name: input.name, email: input.email, password: input.password },
        })
        .catch((error: unknown) => {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : 'Falha ao criar usuário',
          });
        });
      await ctx.db.insert(membership).values(
        input.unitIds.map((unitId) => ({
          unitId,
          userId: result.user.id,
          roleId: input.roleId,
        })),
      );
      return { id: result.user.id };
    }),

  // Cria o usuário via better-auth (hash/conta) e aplica o papel global.
  create: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(255),
        email: z.email(),
        password: z.string().min(8).max(128),
        role: z.enum(userRoles),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await auth.api
        .signUpEmail({
          body: { name: input.name, email: input.email, password: input.password },
        })
        .catch((error: unknown) => {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : 'Falha ao criar usuário',
          });
        });
      if (input.role !== 'client') {
        await ctx.db.update(user).set({ role: input.role }).where(eq(user.id, result.user.id));
      }
      return { id: result.user.id };
    }),

  // — Papéis (mapeamento de permissões por unidade) —

  // Papéis disponíveis para uma empresa: os padrões do sistema (globais,
  // imutáveis — presentes em toda empresa) + os customizados da empresa.
  roles: adminProcedure
    .input(z.object({ companyId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: appRole.id,
          name: appRole.name,
          isSystem: appRole.isSystem,
          companyId: appRole.companyId,
          permissions: appRole.permissions,
        })
        .from(appRole)
        .where(
          and(
            notDeleted(appRole),
            or(isNull(appRole.companyId), eq(appRole.companyId, input.companyId)),
          ),
        )
        .orderBy(desc(appRole.isSystem), asc(appRole.createdAt));
      // Uso: quantos vínculos ativos apontam para cada papel.
      const usage = await ctx.db
        .select({ roleId: membership.roleId, total: count() })
        .from(membership)
        .where(notDeleted(membership))
        .groupBy(membership.roleId);
      const usageById = new Map(usage.map((row) => [row.roleId, row.total]));
      return rows.map((row) => ({ ...row, inUse: usageById.get(row.id) ?? 0 }));
    }),

  // Catálogo 1:1 com o servidor: enumera os endpoints reais que cada ação
  // destrava (dos metadados do router — mesma fonte do PERMISSOES.md).
  permissionCatalog: adminProcedure.query(async () => {
    const { appRouter } = await import('./index');
    const procedures = (
      appRouter._def as unknown as {
        procedures: Record<string, { _def: { type?: string; meta?: { permission?: string; action?: string } } }>;
      }
    ).procedures;
    const byAction = new Map<string, string[]>();
    const reads: string[] = [];
    for (const [path, procedure] of Object.entries(procedures)) {
      const meta = procedure._def.meta;
      if (meta?.action) {
        byAction.set(meta.action, [...(byAction.get(meta.action) ?? []), path]);
      } else if (meta?.permission === 'membro-da-unidade') {
        reads.push(path);
      }
    }
    return {
      actions: unitActions.map((action) => ({
        action,
        procedures: (byAction.get(action) ?? []).sort(),
      })),
      memberReads: reads.sort(),
    };
  }),

  createRole: adminProcedure
    .input(
      z.object({
        companyId: z.uuid(),
        name: z.string().trim().min(2).max(120),
        permissions: z.array(z.enum(unitActions)),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(appRole)
        .values({
          companyId: input.companyId,
          name: input.name,
          permissions: input.permissions,
        })
        .returning();
      return created;
    }),

  updateRole: adminProcedure
    .input(
      z.object({
        roleId: z.uuid(),
        name: z.string().trim().min(2).max(120).optional(),
        permissions: z.array(z.enum(unitActions)).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = await findActiveRole(ctx.db, input.roleId);
      if (role.isSystem) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Papéis do sistema não podem ser alterados — duplique para customizar',
        });
      }
      await ctx.db
        .update(appRole)
        .set({
          ...(input.name ? { name: input.name } : {}),
          ...(input.permissions ? { permissions: input.permissions } : {}),
        })
        .where(eq(appRole.id, role.id));
      return { success: true };
    }),

  removeRole: adminProcedure
    .input(z.object({ roleId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const role = await findActiveRole(ctx.db, input.roleId);
      if (role.isSystem) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Papéis do sistema não podem ser excluídos',
        });
      }
      const [inUse] = await ctx.db
        .select({ unitId: membership.unitId })
        .from(membership)
        .where(and(eq(membership.roleId, role.id), notDeleted(membership)))
        .limit(1);
      if (inUse) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Papel em uso por acessos ativos — troque o papel desses usuários antes',
        });
      }
      await ctx.db.update(appRole).set({ deletedAt: new Date() }).where(eq(appRole.id, role.id));
      return { success: true };
    }),

  // — Acessos (membership) —

  // Unidades liberadas para um usuário, com o papel de cada vínculo.
  memberships: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({ unitId: membership.unitId, roleId: membership.roleId })
        .from(membership)
        .where(and(eq(membership.userId, input.userId), notDeleted(membership)));
    }),

  // Empresas com suas unidades, para montar a matriz de acesso.
  accessTree: adminProcedure.query(async ({ ctx }) => {
    const companies = await ctx.db.query.company.findMany({
      where: notDeleted(company),
      orderBy: [asc(company.name)],
    });
    const units = await ctx.db
      .select({ id: unit.id, name: unit.name, companyId: unit.companyId })
      .from(unit)
      .where(notDeleted(unit))
      .orderBy(asc(unit.name));
    return companies.map((item) => ({
      id: item.id,
      name: item.name,
      units: units.filter((row) => row.companyId === item.id),
    }));
  }),

  grant: adminProcedure
    .input(
      z.object({ userId: z.string(), unitIds: z.array(z.uuid()).min(1), roleId: z.uuid() }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = await findActiveRole(ctx.db, input.roleId);
      if (role.companyId) {
        const rows = await ctx.db
          .select({ companyId: unit.companyId })
          .from(unit)
          .where(inArray(unit.id, input.unitIds));
        if (rows.some((row) => row.companyId !== role.companyId)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Papel de outra empresa — use um papel da empresa da unidade',
          });
        }
      }
      // PK (unit_id, user_id): re-liberar um vínculo soft-deletado o reativa
      // (e atualiza o papel).
      await ctx.db
        .insert(membership)
        .values(
          input.unitIds.map((unitId) => ({
            unitId,
            userId: input.userId,
            roleId: input.roleId,
          })),
        )
        .onConflictDoUpdate({
          target: [membership.unitId, membership.userId],
          set: { deletedAt: null, roleId: input.roleId },
        });
      return { success: true };
    }),

  revoke: adminProcedure
    .input(z.object({ userId: z.string(), unitIds: z.array(z.uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(membership)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(membership.userId, input.userId),
            inArray(membership.unitId, input.unitIds),
            notDeleted(membership),
          ),
        );
      return { success: true };
    }),
});

async function findActiveRole(db: Db, roleId: string) {
  const role = await db.query.appRole.findFirst({
    where: and(eq(appRole.id, roleId), notDeleted(appRole)),
  });
  if (!role) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Papel não encontrado' });
  }
  return role;
}
