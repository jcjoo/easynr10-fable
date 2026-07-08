CREATE TYPE "public"."authorization_event_type" AS ENUM('criada', 'assinada', 'concluida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."authorization_status" AS ENUM('pendente', 'assinada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."authorization_type" AS ENUM('permissao_trabalho', 'ficha_epi');--> statement-breakpoint
CREATE TABLE "authorization" (
	"id" uuid PRIMARY KEY NOT NULL,
	"unit_id" uuid NOT NULL,
	"type" "authorization_type" NOT NULL,
	"employee_id" uuid NOT NULL,
	"details" jsonb NOT NULL,
	"status" "authorization_status" DEFAULT 'pendente' NOT NULL,
	"sign_token" varchar(64) NOT NULL,
	"signed_at" timestamp with time zone,
	"document_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "authorization_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"authorization_id" uuid NOT NULL,
	"type" "authorization_event_type" NOT NULL,
	"actor" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authorization" ADD CONSTRAINT "authorization_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization" ADD CONSTRAINT "authorization_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization" ADD CONSTRAINT "authorization_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization" ADD CONSTRAINT "authorization_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_event" ADD CONSTRAINT "authorization_event_authorization_id_authorization_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."authorization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_authorization_sign_token" ON "authorization" USING btree ("sign_token");--> statement-breakpoint
-- Módulo novo sob Cadastros: papéis que já leem cadastros passam a ler
-- autorizações; quem cria/edita itens passa a gerar autorizações (Gestor
-- incluso). Novos papéis escolhem explicitamente no catálogo.
UPDATE "app_role" SET "permissions" = (
	SELECT jsonb_agg(DISTINCT perm) FROM (
		SELECT jsonb_array_elements_text("app_role"."permissions") AS perm
		UNION
		SELECT 'autorizacoes.ler' WHERE "app_role"."permissions" ? 'cadastros.ler'
		UNION
		SELECT 'autorizacoes.gerar' WHERE "app_role"."permissions" ? 'cadastros.itens'
	) todas
) WHERE "deleted_at" IS NULL AND "permissions" ? 'cadastros.ler';
