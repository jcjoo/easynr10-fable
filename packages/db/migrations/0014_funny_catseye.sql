DROP INDEX "uq_app_role_company_name";--> statement-breakpoint
ALTER TABLE "app_role" ADD COLUMN "unit_id" uuid;--> statement-breakpoint
ALTER TABLE "app_role" ADD CONSTRAINT "app_role_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_app_role_unit_name" ON "app_role" USING btree ("unit_id","name") WHERE "app_role"."deleted_at" IS NULL AND "app_role"."unit_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_app_role_company_name" ON "app_role" USING btree ("company_id","name") WHERE "app_role"."deleted_at" IS NULL AND "app_role"."unit_id" IS NULL;