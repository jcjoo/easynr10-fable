CREATE TABLE "app_role" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_app_role_name" ON "app_role" USING btree ("name") WHERE "app_role"."deleted_at" IS NULL;--> statement-breakpoint
INSERT INTO "app_role" ("id", "name", "is_system", "permissions") VALUES
	(gen_random_uuid(), 'Gestor', true, '["pie.manage","diagnostico.manage","plano.manage","cadastros.manage"]'::jsonb),
	(gen_random_uuid(), 'Leitor', true, '[]'::jsonb);--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "role_id" uuid;--> statement-breakpoint
UPDATE "membership" SET "role_id" = (SELECT "id" FROM "app_role" WHERE "name" = CASE WHEN "membership"."role" = 'manager' THEN 'Gestor' ELSE 'Leitor' END);--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "role_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_role_id_app_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."app_role"("id") ON DELETE no action ON UPDATE no action;
