DROP INDEX "uq_app_role_name";--> statement-breakpoint
ALTER TABLE "app_role" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "app_role" ADD CONSTRAINT "app_role_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_app_role_company_name" ON "app_role" USING btree ("company_id","name") WHERE "app_role"."deleted_at" IS NULL;