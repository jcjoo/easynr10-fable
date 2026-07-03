CREATE TABLE "default_document" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"document_group" "document_group" NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "default_document" ALTER COLUMN "document_group" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "document" ALTER COLUMN "document_group" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "norm" ALTER COLUMN "document_group" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."document_group";--> statement-breakpoint
CREATE TYPE "public"."document_group" AS ENUM('instalacoes', 'instrucoes_e_procedimentos', 'colaboradores', 'equipamentos');--> statement-breakpoint
ALTER TABLE "default_document" ALTER COLUMN "document_group" SET DATA TYPE "public"."document_group" USING "document_group"::"public"."document_group";--> statement-breakpoint
ALTER TABLE "document" ALTER COLUMN "document_group" SET DATA TYPE "public"."document_group" USING "document_group"::"public"."document_group";--> statement-breakpoint
ALTER TABLE "norm" ALTER COLUMN "document_group" SET DATA TYPE "public"."document_group" USING "document_group"::"public"."document_group";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_default_document_name_group" ON "default_document" USING btree ("name","document_group") WHERE "default_document"."deleted_at" IS NULL;