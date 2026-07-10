CREATE INDEX "idx_adequacy_item_requirement_item" ON "adequacy_item_requirement" USING btree ("adequacy_item_id");--> statement-breakpoint
CREATE INDEX "idx_authorization_unit" ON "authorization" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_authorization_employee" ON "authorization" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_authorization_document" ON "authorization" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_authorization_event_authorization" ON "authorization_event" USING btree ("authorization_id");--> statement-breakpoint
CREATE INDEX "idx_diagnostic_adequacy_item" ON "diagnostic" USING btree ("adequacy_item_id");--> statement-breakpoint
CREATE INDEX "idx_document_folder" ON "document" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_diagnostic" ON "evidence" USING btree ("diagnostic_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_item_evidence" ON "evidence_item" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_item_document" ON "evidence_item" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_membership_user" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_norm_requirement_norm" ON "norm_requirement" USING btree ("norm_id");--> statement-breakpoint
CREATE INDEX "idx_register_doc_link_document" ON "register_document_link" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_user_notification_user" ON "user_notification" USING btree ("user_id");