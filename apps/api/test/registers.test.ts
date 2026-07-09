// Cadastros (colaboradores/equipamentos): esqueleto FIXO de pastas no PIE,
// upsert com pasta do item, importação por planilha (upsert por nome),
// campos personalizados e vínculos campo→documento.
import { describe, expect, test } from 'bun:test';
import { registerBasePath } from '@easynr10/shared';
import { seedDocument, setupUnit, uniqueName } from './helpers';

type FolderRow = { id: string; name: string; parentId: string | null };

// Caminho completo (nomes) de uma pasta a partir da lista flat.
function pathOf(folders: FolderRow[], folderId: string | null | undefined) {
  const byId = new Map(folders.map((row) => [row.id, row]));
  const names: string[] = [];
  for (let node = folderId ? byId.get(folderId) : undefined; node; ) {
    names.unshift(node.name);
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return names;
}

describe('registers', () => {
  test('criar unidade gera o esqueleto de pastas de todos os grupos', async () => {
    const { adminCaller, unit } = await setupUnit();
    const folders: FolderRow[] = await adminCaller.folders.list({ unitId: unit.id });
    const paths = new Set(
      folders.map((row) => pathOf(folders, row.id).join('/')),
    );
    for (const base of Object.values(registerBasePath)) {
      expect(paths.has(base.join('/'))).toBe(true);
    }
  });

  test('upsert de colaborador cria a pasta do item sob a lista do grupo', async () => {
    const { adminCaller, unit } = await setupUnit();
    const name = uniqueName('Maria');
    const created = (await adminCaller.registers.upsertEmployee({
      unitId: unit.id,
      name,
      metadata: { funcao: 'Eletricista' },
    }))!;

    const folders: FolderRow[] = await adminCaller.folders.list({ unitId: unit.id });
    expect(pathOf(folders, created.folderId)).toEqual([
      ...registerBasePath.colaboradores,
      name,
    ]);

    // Update por id não cria pasta nova nem duplica.
    const updated = (await adminCaller.registers.upsertEmployee({
      unitId: unit.id,
      employeeId: created.id,
      name,
      metadata: { funcao: 'Supervisora' },
    }))!;
    expect(updated.folderId).toBe(created.folderId);
    expect(updated.metadata).toEqual({ funcao: 'Supervisora' });
  });

  test('upsert de equipamento usa o caminho do tipo', async () => {
    const { adminCaller, unit } = await setupUnit();
    const name = uniqueName('Luva isolante');
    const created = (await adminCaller.registers.upsertEquipment({
      unitId: unit.id,
      name,
      type: 'epi',
      metadata: {},
    }))!;
    const folders: FolderRow[] = await adminCaller.folders.list({ unitId: unit.id });
    expect(pathOf(folders, created.folderId)).toEqual([...registerBasePath.epi, name]);
  });

  test('remoção some da listagem (soft delete)', async () => {
    const { adminCaller, unit } = await setupUnit();
    const created = (await adminCaller.registers.upsertEmployee({
      unitId: unit.id,
      name: uniqueName('Temporário'),
      metadata: {},
    }))!;
    await adminCaller.registers.removeEmployee({ unitId: unit.id, employeeId: created.id });
    const rows = await adminCaller.registers.listEmployees({ unitId: unit.id });
    expect(rows.some((row) => row.id === created.id)).toBe(false);
  });

  test('importação faz upsert por nome (merge de metadata) e conta certo', async () => {
    const { adminCaller, unit } = await setupUnit();
    const existing = uniqueName('João');
    await adminCaller.registers.upsertEmployee({
      unitId: unit.id,
      name: existing,
      metadata: { funcao: 'Técnico', matricula: '123' },
    });

    const result = await adminCaller.registers.importEmployees({
      unitId: unit.id,
      items: [
        { name: existing, metadata: { funcao: 'Engenheiro' } }, // atualiza (merge)
        { name: uniqueName('Nova A'), metadata: {} }, // cria
        { name: uniqueName('Nova B'), metadata: {} }, // cria
      ],
    });
    expect(result).toEqual({ created: 2, updated: 1 });

    const rows = await adminCaller.registers.listEmployees({ unitId: unit.id });
    const joined = rows.find((row) => row.name === existing);
    // Merge: campo novo sobrescreve, campo antigo preservado.
    expect(joined?.metadata).toEqual({ funcao: 'Engenheiro', matricula: '123' });
    // Itens novos ganham pasta própria.
    expect(rows.filter((row) => row.folderId).length).toBe(rows.length);
  });

  test('importação de equipamentos respeita o tipo', async () => {
    const { adminCaller, unit } = await setupUnit();
    const result = await adminCaller.registers.importEquipment({
      unitId: unit.id,
      type: 'ferramenta',
      items: [{ name: uniqueName('Alicate'), metadata: {} }],
    });
    expect(result).toEqual({ created: 1, updated: 0 });
    const rows = await adminCaller.registers.listEquipment({ unitId: unit.id });
    expect(rows.at(-1)?.type).toBe('ferramenta');
  });

  test('campos personalizados: cria, lista por alvo e remove', async () => {
    const { adminCaller, unit } = await setupUnit();
    const created = (await adminCaller.registers.addCustomField({
      unitId: unit.id,
      target: 'epi',
      name: 'Tamanho',
    }))!;
    expect(
      (await adminCaller.registers.listCustomFields({ unitId: unit.id, target: 'epi' })).map(
        (row) => row.name,
      ),
    ).toContain('Tamanho');
    // Alvo diferente não enxerga o campo.
    expect(
      await adminCaller.registers.listCustomFields({ unitId: unit.id, target: 'colaboradores' }),
    ).toHaveLength(0);

    await adminCaller.registers.removeCustomField({
      unitId: unit.id,
      customFieldId: created.id,
    });
    expect(
      await adminCaller.registers.listCustomFields({ unitId: unit.id, target: 'epi' }),
    ).toHaveLength(0);
  });

  test('vínculo campo→documento substitui o anterior e desvincula', async () => {
    const { adminCaller, unit } = await setupUnit();
    const folder = (await adminCaller.folders.create({
      unitId: unit.id,
      parentId: null,
      name: uniqueName('Docs'),
    }))!;
    const docA = await seedDocument(adminCaller, unit.id, folder.id, { name: 'CA antigo' });
    const docB = await seedDocument(adminCaller, unit.id, folder.id, { name: 'CA novo' });
    const epi = (await adminCaller.registers.upsertEquipment({
      unitId: unit.id,
      name: uniqueName('Capacete'),
      type: 'epi',
      metadata: {},
    }))!;

    await adminCaller.registers.linkDocument({
      unitId: unit.id,
      fieldKey: 'ca',
      documentId: docA.id,
      employeeIds: [],
      equipmentIds: [epi.id],
    });
    // Novo vínculo no mesmo campo substitui (máx. 1 documento ativo por campo).
    await adminCaller.registers.linkDocument({
      unitId: unit.id,
      fieldKey: 'ca',
      documentId: docB.id,
      employeeIds: [],
      equipmentIds: [epi.id],
    });
    let links = await adminCaller.registers.documentLinks({ unitId: unit.id });
    const active = links.filter((row) => row.equipmentId === epi.id && row.fieldKey === 'ca');
    expect(active).toHaveLength(1);
    expect(active[0]?.documentId).toBe(docB.id);

    await adminCaller.registers.unlinkDocument({
      unitId: unit.id,
      fieldKey: 'ca',
      equipmentId: epi.id,
    });
    links = await adminCaller.registers.documentLinks({ unitId: unit.id });
    expect(links.some((row) => row.equipmentId === epi.id)).toBe(false);
  });

  test('auto-vínculo: documento com o nome padrão na pasta do item vincula sozinho', async () => {
    const { adminCaller, unit } = await setupUnit();
    const epi = (await adminCaller.registers.upsertEquipment({
      unitId: unit.id,
      name: uniqueName('Luva'),
      type: 'epi',
      metadata: {},
    }))!;
    expect(epi.folderId).not.toBeNull();

    // Nome com o sufixo por item da convenção do catálogo ("Nome - <item>").
    await seedDocument(adminCaller, unit.id, epi.folderId!, {
      name: 'Certificado de Aprovação (CA) - Luva X',
    });

    const links = await adminCaller.registers.documentLinks({ unitId: unit.id });
    const ca = links.find((row) => row.equipmentId === epi.id && row.fieldKey === 'ca');
    expect(ca?.auto).toBe(true);
    expect(ca?.documentName).toBe('Certificado de Aprovação (CA) - Luva X');

    // Vínculo manual tem precedência sobre o automático (não duplica).
    const manual = await seedDocument(adminCaller, unit.id, epi.folderId!, { name: 'CA manual' });
    await adminCaller.registers.linkDocument({
      unitId: unit.id,
      fieldKey: 'ca',
      documentId: manual.id,
      employeeIds: [],
      equipmentIds: [epi.id],
    });
    const after = (await adminCaller.registers.documentLinks({ unitId: unit.id })).filter(
      (row) => row.equipmentId === epi.id && row.fieldKey === 'ca',
    );
    expect(after).toHaveLength(1);
    expect(after[0]?.auto).toBe(false);
    expect(after[0]?.documentId).toBe(manual.id);
  });

  test('auto-vínculo respeita a condição SEP (só Básico + SEP)', async () => {
    const { adminCaller, unit } = await setupUnit();
    const basico = (await adminCaller.registers.upsertEmployee({
      unitId: unit.id,
      name: uniqueName('Básico'),
      metadata: { nivel_autorizacao: 'basico' },
    }))!;
    const sep = (await adminCaller.registers.upsertEmployee({
      unitId: unit.id,
      name: uniqueName('SEP'),
      metadata: { nivel_autorizacao: 'basico_sep' },
    }))!;
    // Mesmo documento padrão de treinamento SEP na pasta de cada um.
    await seedDocument(adminCaller, unit.id, basico.folderId!, {
      name: 'Certificado de Treinamento NR10 SEP',
    });
    await seedDocument(adminCaller, unit.id, sep.folderId!, {
      name: 'Certificado de Treinamento NR10 SEP',
    });

    const links = await adminCaller.registers.documentLinks({ unitId: unit.id });
    const sepField = (id: string) =>
      links.find((row) => row.employeeId === id && row.fieldKey === 'treinamento_nr10_sep');
    expect(sepField(sep.id)?.auto).toBe(true);
    expect(sepField(basico.id)).toBeUndefined();
  });

  test('excluir a pasta do item limpa o vínculo do cadastro e dos documentos', async () => {
    const { adminCaller, unit } = await setupUnit();
    const maria = (await adminCaller.registers.upsertEmployee({
      unitId: unit.id,
      name: uniqueName('Maria'),
      metadata: {},
    }))!;
    expect(maria.folderId).not.toBeNull();

    // Documento na pasta do item, vinculado a um campo do colaborador.
    const doc = await seedDocument(adminCaller, unit.id, maria.folderId!, { name: 'ASO' });
    await adminCaller.registers.linkDocument({
      unitId: unit.id,
      fieldKey: 'aso',
      documentId: doc.id,
      employeeIds: [maria.id],
      equipmentIds: [],
    });

    // Admin exclui a pasta do item com conteúdo (cascata).
    await adminCaller.folders.remove({ unitId: unit.id, folderId: maria.folderId! });

    // Sem vínculo fantasma: colaborador segue listado, mas sem pasta.
    const rows = await adminCaller.registers.listEmployees({ unitId: unit.id });
    const row = rows.find((entry) => entry.id === maria.id);
    expect(row?.folderId).toBeNull();
    expect(row?.folderName).toBeNull();

    // E o vínculo campo→documento morreu junto com o documento.
    const links = await adminCaller.registers.documentLinks({ unitId: unit.id });
    expect(links.some((link) => link.employeeId === maria.id)).toBe(false);
  });

  test('estrutura padrão do grupo: setTargetSetting aplica esquema na pasta do item', async () => {
    const { adminCaller, unit } = await setupUnit();
    const schema = (await adminCaller.folderSchemas.create({
      unitId: unit.id,
      name: uniqueName('Estrutura'),
      structure: [{ name: 'Certificados', children: [{ name: 'Vencidos' }] }],
    }))!;
    await adminCaller.registers.setTargetSetting({
      unitId: unit.id,
      target: 'colaboradores',
      folderSchemaId: schema.id,
    });
    const settings = await adminCaller.registers.targetSettings({ unitId: unit.id });
    expect(settings.find((row) => row.target === 'colaboradores')?.folderSchemaId).toBe(
      schema.id,
    );

    // Criar colaborador COM o esquema gera a estrutura dentro da pasta dele.
    const name = uniqueName('Com estrutura');
    await adminCaller.registers.upsertEmployee({
      unitId: unit.id,
      name,
      metadata: {},
      folderSchemaId: schema.id,
    });
    const folders: FolderRow[] = await adminCaller.folders.list({ unitId: unit.id });
    const paths = new Set(folders.map((row) => pathOf(folders, row.id).join('/')));
    const base = [...registerBasePath.colaboradores, name].join('/');
    expect(paths.has(`${base}/Certificados`)).toBe(true);
    expect(paths.has(`${base}/Certificados/Vencidos`)).toBe(true);
  });
});
