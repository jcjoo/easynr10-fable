CREATE TYPE "public"."nivel_autorizacao" AS ENUM('basico', 'basico_sep');--> statement-breakpoint
CREATE TABLE "equipment_eletrico" (
	"id" uuid PRIMARY KEY NOT NULL,
	"equipment_id" uuid NOT NULL,
	"fabricante" varchar(512),
	"identificacao" varchar(512),
	"tensao" varchar(512),
	"localizacao" varchar(512),
	CONSTRAINT "equipment_eletrico_equipment_id_unique" UNIQUE("equipment_id")
);
--> statement-breakpoint
CREATE TABLE "equipment_epc" (
	"id" uuid PRIMARY KEY NOT NULL,
	"equipment_id" uuid NOT NULL,
	"fabricante" varchar(512),
	"localizacao" varchar(512),
	CONSTRAINT "equipment_epc_equipment_id_unique" UNIQUE("equipment_id")
);
--> statement-breakpoint
CREATE TABLE "equipment_epi" (
	"id" uuid PRIMARY KEY NOT NULL,
	"equipment_id" uuid NOT NULL,
	"fabricante" varchar(512),
	"ca" varchar(512),
	CONSTRAINT "equipment_epi_equipment_id_unique" UNIQUE("equipment_id")
);
--> statement-breakpoint
CREATE TABLE "equipment_ferramenta" (
	"id" uuid PRIMARY KEY NOT NULL,
	"equipment_id" uuid NOT NULL,
	"fabricante" varchar(512),
	"modelo" varchar(512),
	"numero_serie" varchar(512),
	CONSTRAINT "equipment_ferramenta_equipment_id_unique" UNIQUE("equipment_id")
);
--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "nivel_autorizacao" "nivel_autorizacao";--> statement-breakpoint
ALTER TABLE "equipment_eletrico" ADD CONSTRAINT "equipment_eletrico_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_epc" ADD CONSTRAINT "equipment_epc_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_epi" ADD CONSTRAINT "equipment_epi_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_ferramenta" ADD CONSTRAINT "equipment_ferramenta_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Backfill: move os dados default que estavam no metadata (jsonb) para as
-- colunas novas e limpa essas chaves do metadata (que passa a guardar SÓ os
-- campos personalizados). Nível de autorização (colaboradores):
UPDATE "employee" SET "nivel_autorizacao" = ("metadata"->>'nivel_autorizacao')::"public"."nivel_autorizacao"
	WHERE "metadata" ? 'nivel_autorizacao' AND "metadata"->>'nivel_autorizacao' IN ('basico','basico_sep');--> statement-breakpoint
UPDATE "employee" SET "metadata" = "metadata" - 'nivel_autorizacao' WHERE "metadata" ? 'nivel_autorizacao';--> statement-breakpoint
-- Tabelas-filho por tipo de equipamento (uma linha 1:1 por equipamento):
INSERT INTO "equipment_eletrico" ("id","equipment_id","fabricante","identificacao","tensao","localizacao")
	SELECT gen_random_uuid(), e."id", e."metadata"->>'fabricante', e."metadata"->>'identificacao', e."metadata"->>'tensao', e."metadata"->>'localizacao'
	FROM "equipment" e WHERE e."type"='eletrico';--> statement-breakpoint
UPDATE "equipment" SET "metadata" = "metadata" - 'fabricante' - 'identificacao' - 'tensao' - 'localizacao' WHERE "type"='eletrico';--> statement-breakpoint
INSERT INTO "equipment_ferramenta" ("id","equipment_id","fabricante","modelo","numero_serie")
	SELECT gen_random_uuid(), e."id", e."metadata"->>'fabricante', e."metadata"->>'modelo', e."metadata"->>'numero_serie'
	FROM "equipment" e WHERE e."type"='ferramenta';--> statement-breakpoint
UPDATE "equipment" SET "metadata" = "metadata" - 'fabricante' - 'modelo' - 'numero_serie' WHERE "type"='ferramenta';--> statement-breakpoint
INSERT INTO "equipment_epi" ("id","equipment_id","fabricante","ca")
	SELECT gen_random_uuid(), e."id", e."metadata"->>'fabricante', e."metadata"->>'ca'
	FROM "equipment" e WHERE e."type"='epi';--> statement-breakpoint
UPDATE "equipment" SET "metadata" = "metadata" - 'fabricante' - 'ca' WHERE "type"='epi';--> statement-breakpoint
INSERT INTO "equipment_epc" ("id","equipment_id","fabricante","localizacao")
	SELECT gen_random_uuid(), e."id", e."metadata"->>'fabricante', e."metadata"->>'localizacao'
	FROM "equipment" e WHERE e."type"='epc';--> statement-breakpoint
UPDATE "equipment" SET "metadata" = "metadata" - 'fabricante' - 'localizacao' WHERE "type"='epc';
