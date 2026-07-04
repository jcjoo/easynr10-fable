CREATE TABLE "register_folder" (
	"id" uuid PRIMARY KEY NOT NULL,
	"unit_id" uuid NOT NULL,
	"target" "register_target" NOT NULL,
	"folder_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX "uq_custom_field_unit_module_name";--> statement-breakpoint
ALTER TABLE "custom_field" ADD COLUMN "target" "register_target";--> statement-breakpoint
UPDATE "custom_field" SET "target" = (CASE "module"::text WHEN 'colaboradores' THEN 'colaboradores' ELSE 'eletrico' END)::"register_target";--> statement-breakpoint
ALTER TABLE "custom_field" ALTER COLUMN "target" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "register_folder" ADD CONSTRAINT "register_folder_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_folder" ADD CONSTRAINT "register_folder_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_register_folder_unit_target" ON "register_folder" USING btree ("unit_id","target") WHERE "register_folder"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_custom_field_unit_target_name" ON "custom_field" USING btree ("unit_id","target","name") WHERE "custom_field"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "custom_field" DROP COLUMN "module";--> statement-breakpoint
DROP TYPE "public"."register_module";