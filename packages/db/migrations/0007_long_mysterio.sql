CREATE TABLE "register_document_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"employee_id" uuid,
	"equipment_id" uuid,
	"field_key" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DROP TABLE "register_folder" CASCADE;--> statement-breakpoint
ALTER TABLE "register_document_link" ADD CONSTRAINT "register_document_link_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_document_link" ADD CONSTRAINT "register_document_link_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_document_link" ADD CONSTRAINT "register_document_link_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_register_doc_link_employee_field" ON "register_document_link" USING btree ("employee_id","field_key") WHERE "register_document_link"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_register_doc_link_equipment_field" ON "register_document_link" USING btree ("equipment_id","field_key") WHERE "register_document_link"."deleted_at" IS NULL;