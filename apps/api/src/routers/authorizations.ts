import { randomBytes } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { notDeleted, schema } from '@easynr10/db';
import {
  authorizationCreateSchema,
  authorizationTypes,
  signatureDataUrlSchema,
} from '@easynr10/shared';
import { z } from 'zod';
import { publicProcedure, router, unitAction } from '../trpc';
import { presignPreview } from '../s3';
import {
  findAuthorizationByToken,
  findUnitAuthorization,
  signAuthorization,
} from '../services/authorizations';
import { purgeDocuments } from '../services/purge';

const { authorization, authorizationEvent, document, documentVersion, employee } = schema;

// Autorizações (Permissão de Trabalho / Ficha de EPI): o operador escolhe o
// colaborador e gera o documento; a assinatura é presencial (canvas) ou pelo
// link público /assinar/<token> (colaborador sem acesso ao sistema). Assinado,
// o PDF com trilha de auditoria entra na pasta do colaborador no P.I.E.

export const authorizationsRouter = router({
  list: unitAction('autorizacoes.ler')
    .input(z.object({ type: z.enum(authorizationTypes) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          id: authorization.id,
          employeeId: authorization.employeeId,
          employeeName: employee.name,
          details: authorization.details,
          status: authorization.status,
          signToken: authorization.signToken,
          signedAt: authorization.signedAt,
          documentId: authorization.documentId,
          documentName: document.name,
          createdAt: authorization.createdAt,
        })
        .from(authorization)
        .innerJoin(employee, eq(authorization.employeeId, employee.id))
        .leftJoin(document, eq(authorization.documentId, document.id))
        .where(
          and(
            eq(authorization.unitId, input.unitId),
            eq(authorization.type, input.type),
            notDeleted(authorization),
          ),
        )
        .orderBy(desc(authorization.createdAt));
    }),

  create: unitAction('autorizacoes.gerar')
    .input(authorizationCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const found = await ctx.db.query.employee.findFirst({
        where: and(
          eq(employee.id, input.employeeId),
          eq(employee.unitId, input.unitId),
          notDeleted(employee),
        ),
      });
      if (!found) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Colaborador não encontrado' });
      }
      return ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(authorization)
          .values({
            unitId: input.unitId,
            type: input.type,
            employeeId: input.employeeId,
            details: input.details,
            // Link público de assinatura: token opaco e não adivinhável.
            signToken: randomBytes(24).toString('base64url'),
            createdBy: ctx.session.user.id,
          })
          .returning();
        await tx.insert(authorizationEvent).values({
          authorizationId: created!.id,
          type: 'criada',
          actor: `${ctx.session.user.name} solicitou a assinatura de ${found.name}`,
        });
        return created!;
      });
    }),

  // Só pendente cancela — assinada é registro imutável (documento no P.I.E).
  cancel: unitAction('autorizacoes.gerar')
    .input(z.object({ authorizationId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const bundle = await findUnitAuthorization(ctx.db, input.unitId, input.authorizationId);
      if (bundle.authorization.status !== 'pendente') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Apenas autorizações pendentes podem ser canceladas',
        });
      }
      return ctx.db.transaction(async (tx) => {
        await tx
          .update(authorization)
          .set({ status: 'cancelada' })
          .where(eq(authorization.id, bundle.authorization.id));
        await tx.insert(authorizationEvent).values({
          authorizationId: bundle.authorization.id,
          type: 'cancelada',
          actor: ctx.session.user.name,
        });
        return { success: true };
      });
    }),

  // Exclusão DEFINITIVA (ação exclusao.definitiva do papel; admins têm):
  // registro, trilha de auditoria e o PDF no P.I.E somem do sistema — para
  // erros que clientes/auditores não podem ver. Qualquer status, sem volta.
  remove: unitAction('exclusao.definitiva')
    .input(z.object({ authorizationId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const bundle = await findUnitAuthorization(ctx.db, input.unitId, input.authorizationId);
      const row = bundle.authorization;
      await ctx.db.transaction(async (tx) => {
        await tx
          .delete(authorizationEvent)
          .where(eq(authorizationEvent.authorizationId, row.id));
        await tx.delete(authorization).where(eq(authorization.id, row.id));
      });
      if (row.documentId) await purgeDocuments(ctx.db, [row.documentId]);
      return { success: true };
    }),

  // Trilha de auditoria (a mesma impressa no PDF).
  events: unitAction('autorizacoes.ler')
    .input(z.object({ authorizationId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      await findUnitAuthorization(ctx.db, input.unitId, input.authorizationId);
      return ctx.db
        .select({
          id: authorizationEvent.id,
          type: authorizationEvent.type,
          actor: authorizationEvent.actor,
          createdAt: authorizationEvent.createdAt,
        })
        .from(authorizationEvent)
        .where(eq(authorizationEvent.authorizationId, input.authorizationId))
        .orderBy(authorizationEvent.createdAt);
    }),

  // Assinatura presencial: o colaborador assina no dispositivo do operador.
  signInPerson: unitAction('autorizacoes.gerar')
    .input(z.object({ authorizationId: z.uuid(), signature: signatureDataUrlSchema }))
    .mutation(async ({ ctx, input }) => {
      const bundle = await findUnitAuthorization(ctx.db, input.unitId, input.authorizationId);
      return signAuthorization(ctx.db, bundle, {
        signatureDataUrl: input.signature,
        via: 'presencial',
      });
    }),

  // PDF assinado inline (visualizar/baixar direto da aba de autorizações,
  // sem depender da permissão pie.ler).
  documentUrl: unitAction('autorizacoes.ler')
    .input(z.object({ authorizationId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const bundle = await findUnitAuthorization(ctx.db, input.unitId, input.authorizationId);
      if (!bundle.authorization.documentId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Autorização ainda sem PDF assinado' });
      }
      const [row] = await ctx.db
        .select({ name: document.name, storageKey: documentVersion.storageKey })
        .from(document)
        .innerJoin(documentVersion, eq(document.currentVersionId, documentVersion.id))
        .where(eq(document.id, bundle.authorization.documentId));
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Documento não encontrado' });
      }
      return { url: await presignPreview(row.storageKey, row.name, 'application/pdf') };
    }),

  // — Página pública de assinatura (/assinar/<token>) — sem sessão; o token
  // opaco é a credencial. Exposição mínima: só o que a página mostra.
  publicByToken: publicProcedure
    .input(z.object({ token: z.string().min(16).max(64) }))
    .query(async ({ ctx, input }) => {
      const bundle = await findAuthorizationByToken(ctx.db, input.token);
      return {
        type: bundle.authorization.type,
        status: bundle.authorization.status,
        details: bundle.authorization.details,
        employeeName: bundle.employee.name,
        unitName: bundle.unitName,
        companyName: bundle.companyName,
        createdAt: bundle.authorization.createdAt,
        signedAt: bundle.authorization.signedAt,
      };
    }),

  publicSign: publicProcedure
    .input(z.object({ token: z.string().min(16).max(64), signature: signatureDataUrlSchema }))
    .mutation(async ({ ctx, input }) => {
      const bundle = await findAuthorizationByToken(ctx.db, input.token);
      const signed = await signAuthorization(ctx.db, bundle, {
        signatureDataUrl: input.signature,
        via: 'link',
      });
      // O signatário leva uma cópia na hora (URL presigned de curta duração).
      const [row] = await ctx.db
        .select({ name: document.name, storageKey: documentVersion.storageKey })
        .from(document)
        .innerJoin(documentVersion, eq(document.currentVersionId, documentVersion.id))
        .where(eq(document.id, signed.documentId!));
      return {
        signedAt: signed.signedAt,
        downloadUrl: row ? await presignPreview(row.storageKey, row.name, 'application/pdf') : null,
      };
    }),
});
