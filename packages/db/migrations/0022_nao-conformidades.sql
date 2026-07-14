CREATE TABLE "adequacy_item_nc" (
	"id" uuid PRIMARY KEY NOT NULL,
	"adequacy_item_id" uuid NOT NULL,
	"requirement_id" uuid,
	"code" varchar(30) NOT NULL,
	"description" text NOT NULL,
	"recommended_action" text NOT NULL,
	"adherences" "diagnostic_status"[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "norm_nc" (
	"id" uuid PRIMARY KEY NOT NULL,
	"norm_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"description" text NOT NULL,
	"recommended_action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "diagnostic_nc" (
	"id" uuid PRIMARY KEY NOT NULL,
	"diagnostic_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"description" text NOT NULL,
	"recommended_action" text NOT NULL,
	"requirement_question" text NOT NULL,
	"adherence" "diagnostic_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "adequacy_item_nc" ADD CONSTRAINT "adequacy_item_nc_adequacy_item_id_adequacy_item_id_fk" FOREIGN KEY ("adequacy_item_id") REFERENCES "public"."adequacy_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adequacy_item_nc" ADD CONSTRAINT "adequacy_item_nc_requirement_id_adequacy_item_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."adequacy_item_requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norm_nc" ADD CONSTRAINT "norm_nc_norm_id_norm_id_fk" FOREIGN KEY ("norm_id") REFERENCES "public"."norm"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_nc" ADD CONSTRAINT "diagnostic_nc_diagnostic_id_diagnostic_id_fk" FOREIGN KEY ("diagnostic_id") REFERENCES "public"."diagnostic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_adequacy_item_nc_item" ON "adequacy_item_nc" USING btree ("adequacy_item_id");--> statement-breakpoint
CREATE INDEX "idx_norm_nc_norm" ON "norm_nc" USING btree ("norm_id");--> statement-breakpoint
CREATE INDEX "idx_diagnostic_nc_diagnostic" ON "diagnostic_nc" USING btree ("diagnostic_id");