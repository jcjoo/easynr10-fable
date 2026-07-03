ALTER TABLE "adequacy_item_requirement" DROP CONSTRAINT "adequacy_item_requirement_default_document_id_document_id_fk";
--> statement-breakpoint
ALTER TABLE "adequacy_item" ADD COLUMN "orientation" text;--> statement-breakpoint
ALTER TABLE "adequacy_item_requirement" ADD CONSTRAINT "adequacy_item_requirement_default_document_id_default_document_id_fk" FOREIGN KEY ("default_document_id") REFERENCES "public"."default_document"("id") ON DELETE no action ON UPDATE no action;