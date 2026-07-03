CREATE TYPE "public"."action_status" AS ENUM('pendente', 'em_andamento', 'concluida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."diagnostic_status" AS ENUM('insuficiente', 'parcial', 'suficiente', 'conforme');--> statement-breakpoint
CREATE TYPE "public"."document_group" AS ENUM('prontuario', 'laudos', 'treinamentos', 'procedimentos');--> statement-breakpoint
CREATE TYPE "public"."equipment_type" AS ENUM('eletrico', 'ferramenta', 'epi', 'epc');--> statement-breakpoint
CREATE TYPE "public"."group_kind" AS ENUM('custom', 'colaboradores', 'equipamentos');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('manager', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."requirement_type" AS ENUM('document', 'opinion', 'group');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'client');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'client' NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"logo_key" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"unit_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "membership_unit_id_user_id_pk" PRIMARY KEY("unit_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"logo_key" varchar(512),
	"email_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folder_id" uuid NOT NULL,
	"current_version_id" uuid,
	"name" varchar(255) NOT NULL,
	"document_group" "document_group",
	"expires_at" date,
	"warn_days_before" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "document_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"mime_type" varchar(255) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folder" (
	"id" uuid PRIMARY KEY NOT NULL,
	"unit_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" varchar(255) NOT NULL,
	"schema_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "folder_schema" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"structure" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "employee" (
	"id" uuid PRIMARY KEY NOT NULL,
	"register_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"register_item_id" uuid NOT NULL,
	"type" "equipment_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "register_group" (
	"id" uuid PRIMARY KEY NOT NULL,
	"unit_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"kind" "group_kind" DEFAULT 'custom' NOT NULL,
	"metadata_config" jsonb,
	"folder_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "register_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"folder_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "adequacy_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"unit_id" uuid NOT NULL,
	"norm_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "adequacy_item_requirement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"adequacy_item_id" uuid NOT NULL,
	"type" "requirement_type" NOT NULL,
	"question" text NOT NULL,
	"register_group_id" uuid,
	"default_document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "norm" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"orientation" text NOT NULL,
	"importance_weight" integer NOT NULL,
	"document_group" "document_group",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "norm_requirement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"norm_id" uuid NOT NULL,
	"type" "requirement_type" NOT NULL,
	"question" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "action_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"diagnostic_id" uuid NOT NULL,
	"status" "action_status" DEFAULT 'pendente' NOT NULL,
	"deadline" date NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "diagnostic" (
	"id" uuid PRIMARY KEY NOT NULL,
	"adequacy_item_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"status" "diagnostic_status" NOT NULL,
	"deadline" date,
	"responsible" varchar(255),
	"recommended_action" text,
	"technical_opinion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"diagnostic_id" uuid NOT NULL,
	"type" "requirement_type" NOT NULL,
	"question" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evidence_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evidence_id" uuid NOT NULL,
	"register_item_id" uuid,
	"document_id" uuid,
	"label" varchar(512) NOT NULL,
	"answer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"unit_id" uuid,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_notification" (
	"notification_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_notification_notification_id_user_id_pk" PRIMARY KEY("notification_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit" ADD CONSTRAINT "unit_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_current_version_id_document_version_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."document_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_parent_id_folder_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_schema_id_folder_schema_id_fk" FOREIGN KEY ("schema_id") REFERENCES "public"."folder_schema"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_register_item_id_register_item_id_fk" FOREIGN KEY ("register_item_id") REFERENCES "public"."register_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_register_item_id_register_item_id_fk" FOREIGN KEY ("register_item_id") REFERENCES "public"."register_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_group" ADD CONSTRAINT "register_group_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_group" ADD CONSTRAINT "register_group_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_item" ADD CONSTRAINT "register_item_group_id_register_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."register_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_item" ADD CONSTRAINT "register_item_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adequacy_item" ADD CONSTRAINT "adequacy_item_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adequacy_item" ADD CONSTRAINT "adequacy_item_norm_id_norm_id_fk" FOREIGN KEY ("norm_id") REFERENCES "public"."norm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adequacy_item_requirement" ADD CONSTRAINT "adequacy_item_requirement_adequacy_item_id_adequacy_item_id_fk" FOREIGN KEY ("adequacy_item_id") REFERENCES "public"."adequacy_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adequacy_item_requirement" ADD CONSTRAINT "adequacy_item_requirement_register_group_id_register_group_id_fk" FOREIGN KEY ("register_group_id") REFERENCES "public"."register_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adequacy_item_requirement" ADD CONSTRAINT "adequacy_item_requirement_default_document_id_document_id_fk" FOREIGN KEY ("default_document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm_requirement" ADD CONSTRAINT "norm_requirement_norm_id_norm_id_fk" FOREIGN KEY ("norm_id") REFERENCES "public"."norm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_diagnostic_id_diagnostic_id_fk" FOREIGN KEY ("diagnostic_id") REFERENCES "public"."diagnostic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic" ADD CONSTRAINT "diagnostic_adequacy_item_id_adequacy_item_id_fk" FOREIGN KEY ("adequacy_item_id") REFERENCES "public"."adequacy_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic" ADD CONSTRAINT "diagnostic_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_diagnostic_id_diagnostic_id_fk" FOREIGN KEY ("diagnostic_id") REFERENCES "public"."diagnostic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_item" ADD CONSTRAINT "evidence_item_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_item" ADD CONSTRAINT "evidence_item_register_item_id_register_item_id_fk" FOREIGN KEY ("register_item_id") REFERENCES "public"."register_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_item" ADD CONSTRAINT "evidence_item_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notification" ADD CONSTRAINT "user_notification_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notification" ADD CONSTRAINT "user_notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_company_name" ON "company" USING btree ("name") WHERE "company"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_unit_company_name" ON "unit" USING btree ("company_id","name") WHERE "unit"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_document_version_number" ON "document_version" USING btree ("document_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_folder_unit_parent_name" ON "folder" USING btree ("unit_id","parent_id","name") WHERE "folder"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_employee_register_item" ON "employee" USING btree ("register_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_equipment_register_item" ON "equipment" USING btree ("register_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_register_group_unit_name" ON "register_group" USING btree ("unit_id","name") WHERE "register_group"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_register_item_group_name" ON "register_item" USING btree ("group_id","name") WHERE "register_item"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_adequacy_item_unit_norm" ON "adequacy_item" USING btree ("unit_id","norm_id") WHERE "adequacy_item"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_norm_code" ON "norm" USING btree ("code") WHERE "norm"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_action_item_diagnostic" ON "action_item" USING btree ("diagnostic_id");