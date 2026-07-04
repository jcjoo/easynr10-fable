ALTER TABLE "diagnostic" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."diagnostic_status";--> statement-breakpoint
CREATE TYPE "public"."diagnostic_status" AS ENUM('inexistente', 'inadequada', 'parcial', 'suficiente', 'plena');--> statement-breakpoint
UPDATE "diagnostic" SET "status" = CASE "status" WHEN 'insuficiente' THEN 'inadequada' WHEN 'conforme' THEN 'plena' ELSE "status" END;--> statement-breakpoint
ALTER TABLE "diagnostic" ALTER COLUMN "status" SET DATA TYPE "public"."diagnostic_status" USING "status"::"public"."diagnostic_status";