-- Aderência calculada pelas evidências (10/07/2026).
-- Reset dos diagnósticos: o status era escolhido à mão e agora é calculado
-- pela média das notas das evidências — os registros antigos perdem o sentido.
DELETE FROM "action_item";--> statement-breakpoint
DELETE FROM "evidence_item";--> statement-breakpoint
DELETE FROM "evidence";--> statement-breakpoint
DELETE FROM "diagnostic";--> statement-breakpoint
-- Requisito tipo group vira cadastro (rename preserva as linhas existentes).
ALTER TYPE "public"."requirement_type" RENAME VALUE 'group' TO 'cadastro';--> statement-breakpoint
ALTER TABLE "adequacy_item_requirement" DROP CONSTRAINT "adequacy_item_requirement_default_document_id_default_document_id_fk";--> statement-breakpoint
ALTER TABLE "adequacy_item_requirement" ADD COLUMN "field_key" varchar(120);--> statement-breakpoint
ALTER TABLE "diagnostic" ADD COLUMN "score" integer;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "adherence" "diagnostic_status";--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "adherence" "diagnostic_status";--> statement-breakpoint
ALTER TABLE "evidence_item" ADD COLUMN "adherence" "diagnostic_status";--> statement-breakpoint
ALTER TABLE "register_document_link" ADD COLUMN "adherence" "diagnostic_status";--> statement-breakpoint
ALTER TABLE "adequacy_item_requirement" DROP COLUMN "default_document_id";
