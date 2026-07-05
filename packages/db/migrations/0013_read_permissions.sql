-- Leitura virou permissão por módulo: adiciona as 6 leituras ("*.ler") a
-- TODOS os papéis ativos, preservando o comportamento anterior (qualquer
-- membro lia tudo). Novos papéis escolhem explicitamente.
UPDATE "app_role" SET "permissions" = (
	SELECT jsonb_agg(DISTINCT perm) FROM (
		SELECT jsonb_array_elements_text("app_role"."permissions") AS perm
		UNION
		SELECT unnest(ARRAY['pie.ler','diagnostico.ler','plano.ler','cadastros.ler','painel.ler','relatorios.ler'])
	) todas
) WHERE "deleted_at" IS NULL;
