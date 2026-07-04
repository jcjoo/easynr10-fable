CREATE TYPE "public"."register_module" AS ENUM('colaboradores', 'equipamentos');--> statement-breakpoint
CREATE TYPE "public"."register_target" AS ENUM('colaboradores', 'eletrico', 'ferramenta', 'epi', 'epc');--> statement-breakpoint
CREATE TABLE "custom_field" (
	"id" uuid PRIMARY KEY NOT NULL,
	"unit_id" uuid NOT NULL,
	"module" "register_module" NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "register_group" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "register_item" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "register_group" CASCADE;--> statement-breakpoint
DROP TABLE "register_item" CASCADE;--> statement-breakpoint
ALTER TABLE "employee" DROP CONSTRAINT IF EXISTS "employee_register_item_id_register_item_id_fk";
--> statement-breakpoint
ALTER TABLE "equipment" DROP CONSTRAINT IF EXISTS "equipment_register_item_id_register_item_id_fk";
--> statement-breakpoint
ALTER TABLE "adequacy_item_requirement" DROP CONSTRAINT IF EXISTS "adequacy_item_requirement_register_group_id_register_group_id_fk";
--> statement-breakpoint
ALTER TABLE "evidence_item" DROP CONSTRAINT IF EXISTS "evidence_item_register_item_id_register_item_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_employee_register_item";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_equipment_register_item";--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "unit_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "unit_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "adequacy_item_requirement" ADD COLUMN "target_group" "register_target";--> statement-breakpoint
ALTER TABLE "evidence_item" ADD COLUMN "employee_id" uuid;--> statement-breakpoint
ALTER TABLE "evidence_item" ADD COLUMN "equipment_id" uuid;--> statement-breakpoint
ALTER TABLE "custom_field" ADD CONSTRAINT "custom_field_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_custom_field_unit_module_name" ON "custom_field" USING btree ("unit_id","module","name") WHERE "custom_field"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_item" ADD CONSTRAINT "evidence_item_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_item" ADD CONSTRAINT "evidence_item_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_employee_unit_name" ON "employee" USING btree ("unit_id","name") WHERE "employee"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_equipment_unit_name" ON "equipment" USING btree ("unit_id","name") WHERE "equipment"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "employee" DROP COLUMN "register_item_id";--> statement-breakpoint
ALTER TABLE "equipment" DROP COLUMN "register_item_id";--> statement-breakpoint
ALTER TABLE "adequacy_item_requirement" DROP COLUMN "register_group_id";--> statement-breakpoint
ALTER TABLE "evidence_item" DROP COLUMN "register_item_id";--> statement-breakpoint
DROP TYPE "public"."group_kind";