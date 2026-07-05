-- Catálogo de permissões virou GRANULAR (1 item por capacidade, com
-- descrição): expande as ações antigas ("*.manage") dos papéis existentes
-- para os itens equivalentes do novo catálogo.
UPDATE "app_role" SET "permissions" = (
	SELECT COALESCE(jsonb_agg(DISTINCT granular), '[]'::jsonb)
	FROM jsonb_array_elements_text("app_role"."permissions") AS old(perm)
	CROSS JOIN LATERAL jsonb_array_elements_text(
		CASE old.perm
			WHEN 'pie.manage' THEN '["pie.pasta.criar","pie.pasta.renomear","pie.pasta.excluir","pie.documento.enviar","pie.documento.editar","pie.documento.excluir","pie.documento.restaurar","pie.estruturas.gerenciar"]'::jsonb
			WHEN 'diagnostico.manage' THEN '["diagnostico.avaliar","diagnostico.configurar","diagnostico.requisitos","diagnostico.gerar"]'::jsonb
			WHEN 'plano.manage' THEN '["plano.status"]'::jsonb
			WHEN 'cadastros.manage' THEN '["cadastros.itens","cadastros.importar","cadastros.vinculos","cadastros.campos","cadastros.config"]'::jsonb
			ELSE jsonb_build_array(old.perm)
		END
	) AS granular
) WHERE "deleted_at" IS NULL AND jsonb_array_length("permissions") > 0;
