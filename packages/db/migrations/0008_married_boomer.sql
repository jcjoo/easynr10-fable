CREATE TABLE "register_target_setting" (
	"id" uuid PRIMARY KEY NOT NULL,
	"unit_id" uuid NOT NULL,
	"target" "register_target" NOT NULL,
	"folder_schema_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "register_target_setting" ADD CONSTRAINT "register_target_setting_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_target_setting" ADD CONSTRAINT "register_target_setting_folder_schema_id_folder_schema_id_fk" FOREIGN KEY ("folder_schema_id") REFERENCES "public"."folder_schema"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_register_target_setting" ON "register_target_setting" USING btree ("unit_id","target") WHERE "register_target_setting"."deleted_at" IS NULL;