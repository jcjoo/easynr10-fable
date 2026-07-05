import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
  FileSpreadsheet,
  Link2,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react';
import {
  defaultRegisterFields,
  equipmentTypeLabels,
  equipmentTypes,
  registerBasePath,
  registerTargetLabels,
  type EquipmentType,
  type RegisterField,
  type RegisterModule,
  type RegisterTarget,
} from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FolderIcon } from '@/components/ui/icons';
import { Page } from '@/components/ui/page';
import { SelectField } from '@/components/ui/select';
import { DocumentPickerDialog } from '@/components/pie/document-picker';
import { ImportDialog } from '@/components/registros/import-dialog';
import {
  PlainTh,
  SortableTh,
  sortRows,
  toggleSort,
  type SortState,
  type SortValue,
} from '@/components/ui/sortable';

// Cadastros da unidade (RF18): Colaboradores e Equipamentos (abas por tipo).
// Estrutura de pastas FIXA no PIE (criada sob demanda ao cadastrar):
//   Colaboradores/Lista de Colaboradores/[nome]/[estrutura opcional]
//   Equipamentos/<Tipo>/Lista de <Tipo>/[nome]/[estrutura opcional]
// Campos kind=document (ex.: CA do EPI) são vinculados a documentos do PIE —
// um documento pode cobrir N itens (base das automações de vencimento).

interface RegisterRow {
  id: string;
  name: string;
  type?: EquipmentType;
  folderId: string | null;
  folderName: string | null;
  metadata: Record<string, string>;
}

interface DocLink {
  employeeId: string | null;
  equipmentId: string | null;
  fieldKey: string;
  documentId: string;
  documentName: string;
  expiresAt: string | null;
  warnDaysBefore: number | null;
}

const rowActionClass = `cursor-pointer rounded-ctl p-1 text-muted opacity-0 transition-opacity
  hover:bg-line/60 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100`;

function expiryTone(link: DocLink) {
  if (!link.expiresAt) return 'bg-idle-soft text-idle';
  const days = Math.ceil(
    (new Date(`${link.expiresAt}T00:00:00`).getTime() - Date.now()) / 86_400_000,
  );
  if (days < 0) return 'bg-bad-soft text-bad';
  if (days <= (link.warnDaysBefore ?? 30)) return 'bg-warn-soft text-warn';
  return 'bg-ok-soft text-ok';
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

export function RegisterPage({ module }: { module: RegisterModule }) {
  const isEmployees = module === 'colaboradores';
  const title = isEmployees ? 'Colaboradores' : 'Equipamentos';
  const itemLabel = isEmployees ? 'colaborador' : 'equipamento';

  const { companyId, unitId } = useParams({ strict: false }) as {
    companyId: string;
    unitId: string;
  };
  const { ord, dir, novo, tipo } = useSearch({ strict: false }) as SortState & {
    novo?: '1';
    tipo?: EquipmentType;
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // O tipo de equipamento vem da URL (?tipo=, filho de Cadastros na sidebar).
  const equipmentTab: EquipmentType = tipo ?? 'eletrico';
  const target: RegisterTarget = isEmployees ? 'colaboradores' : equipmentTab;
  const defaults = defaultRegisterFields[target];
  const documentFields = defaults.filter((field) => field.kind === 'document');

  // Ações de escrita só aparecem com a permissão confirmada no papel.
  const { can } = useUnitPermissions(unitId);
  const canManageItems = can('cadastros.itens');
  const canImport = can('cadastros.importar');
  const canLink = can('cadastros.vinculos');
  const canConfigureGroup = can('cadastros.campos') || can('cadastros.config');

  const employees = useQuery({
    ...trpc.registers.listEmployees.queryOptions({ unitId }),
    enabled: isEmployees,
  });
  const equipment = useQuery({
    ...trpc.registers.listEquipment.queryOptions({ unitId }),
    enabled: !isEmployees,
  });
  const rows: RegisterRow[] = isEmployees
    ? (employees.data ?? [])
    : (equipment.data ?? []).filter((row) => row.type === equipmentTab);

  const customFields = useQuery(trpc.registers.listCustomFields.queryOptions({ unitId, target }));
  const schemas = useQuery(trpc.folderSchemas.listByUnit.queryOptions({ unitId }));
  const links = useQuery(trpc.registers.documentLinks.queryOptions({ unitId }));
  // Config por grupo-alvo: estrutura de pastas padrão pré-selecionada no editor.
  const targetSettings = useQuery(trpc.registers.targetSettings.queryOptions({ unitId }));
  const defaultSchemaFor = (wanted: RegisterTarget) =>
    targetSettings.data?.find((row) => row.target === wanted)?.folderSchemaId ?? '';

  // Vínculos por item+campo.
  const linkByItemField = useMemo(() => {
    const map = new Map<string, DocLink>();
    for (const link of links.data ?? []) {
      map.set(`${link.employeeId ?? link.equipmentId}:${link.fieldKey}`, link);
    }
    return map;
  }, [links.data]);

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: isEmployees
        ? trpc.registers.listEmployees.queryKey({ unitId })
        : trpc.registers.listEquipment.queryKey({ unitId }),
    });
    queryClient.invalidateQueries({ queryKey: trpc.folders.list.queryKey({ unitId }) });
  };
  const invalidateLinks = () =>
    queryClient.invalidateQueries({ queryKey: trpc.registers.documentLinks.queryKey({ unitId }) });

  // — Criar/editar item —
  const [editing, setEditing] = useState<RegisterRow | 'new' | null>(null);
  const [name, setName] = useState('');
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [folderSchemaId, setFolderSchemaId] = useState('');
  // Tipo escolhido DENTRO do modal de equipamento (troca entre os 4 tipos).
  const [editType, setEditType] = useState<EquipmentType>('eletrico');
  const editorTarget: RegisterTarget = isEmployees ? 'colaboradores' : editType;
  // Campos do editor seguem o tipo selecionado no modal (≠ aba ativa).
  const editorCustomFields = useQuery({
    ...trpc.registers.listCustomFields.queryOptions({ unitId, target: editorTarget }),
    enabled: Boolean(editing),
  });
  const editorFields: RegisterField[] = [
    ...defaultRegisterFields[editorTarget],
    ...(editorCustomFields.data ?? []).map((field) => ({ key: field.name, label: field.name })),
  ];

  function openEditor(row: RegisterRow | 'new') {
    setEditing(row);
    setName(row === 'new' ? '' : row.name);
    setMetadata(row === 'new' ? {} : (row.metadata ?? {}));
    const rowType = row === 'new' ? equipmentTab : (row.type ?? equipmentTab);
    setEditType(rowType);
    // Estrutura padrão do grupo vem pré-selecionada (mas segue opcional).
    setFolderSchemaId(
      row === 'new' ? defaultSchemaFor(isEmployees ? 'colaboradores' : rowType) : '',
    );
  }

  // Trocar o tipo no modal re-seleciona a estrutura padrão daquele grupo.
  function changeEditType(next: EquipmentType) {
    setEditType(next);
    if (editing === 'new') setFolderSchemaId(defaultSchemaFor(next));
  }

  // Botão "Novo" da sidebar (?novo=1): abre o editor de criação e limpa o flag.
  useEffect(() => {
    if (!novo) return;
    openEditor('new');
    navigate({
      to: isEmployees ? '/$companyId/$unitId/colaboradores' : '/$companyId/$unitId/equipamentos',
      params: { companyId, unitId },
      search: { ord, dir, ...(isEmployees ? {} : { tipo: equipmentTab }) },
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novo]);

  const upsertEmployee = useMutation(
    trpc.registers.upsertEmployee.mutationOptions({
      onSuccess: () => {
        setEditing(null);
        invalidate();
      },
    }),
  );
  const upsertEquipment = useMutation(
    trpc.registers.upsertEquipment.mutationOptions({
      onSuccess: () => {
        setEditing(null);
        invalidate();
      },
    }),
  );
  const upsert = isEmployees ? upsertEmployee : upsertEquipment;

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const base = {
      unitId,
      name: name.trim(),
      metadata,
      folderSchemaId: editing === 'new' && folderSchemaId ? folderSchemaId : null,
    };
    if (isEmployees) {
      upsertEmployee.mutate({
        ...base,
        employeeId: editing !== 'new' && editing ? editing.id : undefined,
      });
    } else {
      upsertEquipment.mutate({
        ...base,
        type: editType,
        equipmentId: editing !== 'new' && editing ? editing.id : undefined,
      });
    }
  }

  // — Excluir item —
  const [deleteTarget, setDeleteTarget] = useState<RegisterRow | null>(null);
  const removeEmployee = useMutation(
    trpc.registers.removeEmployee.mutationOptions({
      onSuccess: () => {
        setDeleteTarget(null);
        invalidate();
      },
    }),
  );
  const removeEquipment = useMutation(
    trpc.registers.removeEquipment.mutationOptions({
      onSuccess: () => {
        setDeleteTarget(null);
        invalidate();
      },
    }),
  );

  // — Campos personalizados —
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [newField, setNewField] = useState('');
  const invalidateFields = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.registers.listCustomFields.queryKey({ unitId, target }),
    });
  const addField = useMutation(
    trpc.registers.addCustomField.mutationOptions({
      onSuccess: () => {
        setNewField('');
        invalidateFields();
      },
    }),
  );
  const removeField = useMutation(
    trpc.registers.removeCustomField.mutationOptions({ onSuccess: invalidateFields }),
  );
  const setTargetSetting = useMutation(
    trpc.registers.setTargetSetting.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.registers.targetSettings.queryKey({ unitId }),
        }),
    }),
  );

  // — Vincular documento (campos kind=document) —
  const [linkDialog, setLinkDialog] = useState<{
    field: RegisterField;
    preselected?: string;
  } | null>(null);
  const [linkDocumentId, setLinkDocumentId] = useState('');
  const [linkDocumentName, setLinkDocumentName] = useState('');
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [linkSelection, setLinkSelection] = useState<Set<string>>(new Set());
  const linkDocument = useMutation(
    trpc.registers.linkDocument.mutationOptions({
      onSuccess: () => {
        setLinkDialog(null);
        invalidateLinks();
      },
    }),
  );
  const unlinkDocument = useMutation(
    trpc.registers.unlinkDocument.mutationOptions({ onSuccess: invalidateLinks }),
  );

  function openLinkDialog(field: RegisterField, preselected?: string) {
    setLinkDialog({ field, preselected });
    setLinkSelection(new Set(preselected ? [preselected] : []));
    const currentLink = preselected
      ? linkByItemField.get(`${preselected}:${field.key}`)
      : undefined;
    setLinkDocumentId(currentLink?.documentId ?? '');
    setLinkDocumentName(currentLink?.documentName ?? '');
  }

  // — Importação por planilha (dialog em components/registros/import-dialog) —
  const [importOpen, setImportOpen] = useState(false);

  // Todos os campos têm valor texto no metadata — nos kind=document esse valor
  // é o código cadastrado (ex.: nº do CA); o documento do PIE é vinculado à parte.
  const allFields: RegisterField[] = [
    ...defaults,
    ...(customFields.data ?? []).map((field) => ({ key: field.name, label: field.name })),
  ];


  // Ordenação (?ord=&dir=): nome, campos (default+personalizados) e pasta.
  // Campos kind=document ordenam pelo código cadastrado; sem código, pelo
  // nome do documento vinculado.
  const currentOrd = ord ?? 'nome';
  const currentDir = dir ?? 'asc';
  const fieldAccessor = (field: RegisterField) => (row: RegisterRow): SortValue => {
    const value = row.metadata?.[field.key];
    if (field.kind === 'document' && !value) {
      const link = linkByItemField.get(`${row.id}:${field.key}`);
      return link ? normalize(link.documentName) : null;
    }
    return value ? normalize(value) : null;
  };
  const accessors: Record<string, (row: RegisterRow) => SortValue> = {
    nome: (row) => normalize(row.name),
    pasta: (row) => (row.folderName ? normalize(row.folderName) : null),
    ...Object.fromEntries(
      allFields.map((field) => [`campo:${field.key}`, fieldAccessor(field)]),
    ),
  };
  const sorted = sortRows(rows, accessors[currentOrd] ?? accessors.nome!, currentDir);
  const handleSort = (key: string) =>
    navigate({
      to: isEmployees ? '/$companyId/$unitId/colaboradores' : '/$companyId/$unitId/equipamentos',
      params: { companyId, unitId },
      search: {
        ...(isEmployees ? {} : { tipo: equipmentTab }),
        ...toggleSort({ ord, dir }, key, 'nome'),
      },
    });

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Cadastros</p>
          {/* Sem as abas, o h1 diz qual tipo está ativo (ex.: "Ferramentas"). */}
          <h1 className="text-[28px] font-bold tracking-tight">
            {isEmployees ? title : registerTargetLabels[equipmentTab]}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {canImport && (
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet aria-hidden className="size-4" /> Importar planilha
            </Button>
          )}
          {canConfigureGroup && (
            <Button variant="secondary" onClick={() => setFieldsOpen(true)}>
              <Settings2 aria-hidden className="size-4" /> Configurar grupo
            </Button>
          )}
          {canLink &&
            documentFields.map((field) => (
              <Button key={field.key} variant="secondary" onClick={() => openLinkDialog(field)}>
                <Link2 aria-hidden className="size-4" /> Vincular {field.label}
              </Button>
            ))}
          {canManageItems && (
            <Button onClick={() => openEditor('new')}>
              {isEmployees ? (
                <UserPlus aria-hidden className="size-4" />
              ) : (
                <Wrench aria-hidden className="size-4" />
              )}
              Novo {itemLabel}
            </Button>
          )}
        </div>
      </div>

      {/* O tipo de equipamento vive na sidebar (filhos de Cadastros, ?tipo=). */}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {[
                ['nome', 'Nome'] as const,
                ...allFields.map((field) => [`campo:${field.key}`, field.label] as const),
                ['pasta', 'Pasta no PIE'] as const,
              ].map(([key, label]) => (
                <SortableTh
                  key={key}
                  colKey={key}
                  label={label}
                  ord={currentOrd}
                  dir={currentDir}
                  onSort={handleSort}
                />
              ))}
              <PlainTh />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3 + allFields.length} className="px-3.5 py-12 text-center text-muted">
                  Nenhum item cadastrado — os requisitos de evidência tipo grupo expandem os
                  itens deste cadastro.
                </td>
              </tr>
            )}
            {sorted.map((row) => (
              <tr key={row.id} className="group hover:bg-paper">
                <td className="border-b border-line px-3.5 py-2.5 font-medium">{row.name}</td>
                {allFields.map((field) => {
                  if (field.kind === 'document') {
                    const link = linkByItemField.get(`${row.id}:${field.key}`);
                    const code = row.metadata?.[field.key];
                    return (
                      <td key={field.key} className="border-b border-line px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                          {code && (
                            <span className="tabular whitespace-nowrap font-mono text-[13px]">
                              {code}
                            </span>
                          )}
                          {link ? (
                            <span
                              className={`inline-flex max-w-56 items-center gap-1 rounded-full py-0.5 pl-2.5 ${canLink ? 'pr-1' : 'pr-2.5'} font-ui text-[12.5px] font-semibold ${expiryTone(link)}`}
                            >
                              {canLink ? (
                                <button
                                  type="button"
                                  title={`Trocar documento de ${field.label}`}
                                  onClick={() => openLinkDialog(field, row.id)}
                                  className="cursor-pointer truncate hover:underline"
                                >
                                  {link.documentName}
                                </button>
                              ) : (
                                <span className="truncate">{link.documentName}</span>
                              )}
                              {canLink && (
                                <button
                                  type="button"
                                  title="Desvincular"
                                  aria-label={`Desvincular ${field.label} de ${row.name}`}
                                  onClick={() =>
                                    unlinkDocument.mutate({
                                      unitId,
                                      fieldKey: field.key,
                                      employeeId: isEmployees ? row.id : null,
                                      equipmentId: isEmployees ? null : row.id,
                                    })
                                  }
                                  className="cursor-pointer rounded-full p-0.5 hover:bg-ink/10"
                                >
                                  <X aria-hidden className="size-3" />
                                </button>
                              )}
                            </span>
                          ) : canLink ? (
                            <button
                              type="button"
                              onClick={() => openLinkDialog(field, row.id)}
                              className="cursor-pointer rounded-full border border-dashed border-line-strong px-2.5 py-0.5 font-ui text-[12.5px] font-medium text-muted hover:border-action hover:text-action"
                            >
                              Vincular…
                            </button>
                          ) : (
                            !code && <span className="text-muted">—</span>
                          )}
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={field.key} className="border-b border-line px-3.5 py-2.5 text-ink-soft">
                      {row.metadata?.[field.key] || '—'}
                    </td>
                  );
                })}
                <td className="border-b border-line px-3.5 py-2.5">
                  {row.folderId ? (
                    <Link
                      to="/$companyId/$unitId/pie"
                      params={{ companyId, unitId }}
                      search={{ pasta: row.folderId }}
                      className="flex max-w-52 items-center gap-1.5 text-[13px] text-muted hover:text-action hover:underline"
                    >
                      <FolderIcon aria-hidden className="size-3.5 shrink-0" />
                      <span className="truncate">{row.folderName}</span>
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="border-b border-line px-3.5 py-2.5">
                  <div className="flex items-center justify-end gap-0.5">
                    {canManageItems && (
                      <>
                        <button
                          type="button"
                          title="Editar"
                          aria-label={`Editar ${row.name}`}
                          onClick={() => openEditor(row)}
                          className={rowActionClass}
                        >
                          <Pencil aria-hidden className="size-4" />
                        </button>
                        <button
                          type="button"
                          title="Excluir"
                          aria-label={`Excluir ${row.name}`}
                          onClick={() => setDeleteTarget(row)}
                          className={rowActionClass}
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* — Criar/editar — */}
      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? `Novo ${itemLabel}` : `Editar ${itemLabel}`}
      >
        <form onSubmit={save} className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          {!isEmployees && (
            <SelectField
              label="Tipo de equipamento"
              value={editType}
              onChange={(e) => changeEditType(e.target.value as EquipmentType)}
            >
              {equipmentTypes.map((value) => (
                <option key={value} value={value}>
                  {equipmentTypeLabels[value]}
                </option>
              ))}
            </SelectField>
          )}
          <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {editorFields.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              value={metadata[field.key] ?? ''}
              onChange={(e) =>
                setMetadata((state) => ({ ...state, [field.key]: e.target.value }))
              }
              hint={
                field.kind === 'document'
                  ? 'Código cadastrado; o documento do PIE é vinculado pelo botão "Vincular" na lista'
                  : undefined
              }
            />
          ))}
          {editing === 'new' && (
            <div className="rounded-card border border-line bg-paper p-3">
              <p className="text-[13px] text-ink-soft">
                A pasta <strong>{name.trim() || `do ${itemLabel}`}</strong> será criada
                automaticamente em{' '}
                <strong>{registerBasePath[editorTarget].join(' / ')}</strong>.
              </p>
              <SelectField
                label="Estrutura de pastas dentro da pasta do item (opcional)"
                hint={
                  defaultSchemaFor(editorTarget)
                    ? 'Pré-selecionada pela configuração do grupo — pode trocar ou remover'
                    : 'Configure um padrão do grupo em "Configurar grupo"'
                }
                value={folderSchemaId}
                onChange={(e) => setFolderSchemaId(e.target.value)}
                className="mt-2"
              >
                <option value="">Sem estrutura</option>
                {schemas.data?.map((schemaItem) => (
                  <option key={schemaItem.id} value={schemaItem.id}>
                    {schemaItem.name}
                  </option>
                ))}
              </SelectField>
            </div>
          )}
          {upsert.error && (
            <p role="alert" className="text-sm text-bad">
              {upsert.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim() || upsert.isPending}>
              {upsert.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* — Vincular documento a N itens — */}
      <Dialog
        open={Boolean(linkDialog)}
        onClose={() => setLinkDialog(null)}
        title={`Vincular ${linkDialog?.field.label ?? ''} — ${registerTargetLabels[target]}`}
      >
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <p className="text-sm text-muted">
            Escolha o documento do PIE e marque os itens cobertos por ele — o vencimento do
            documento passa a valer para todos (alertas e diagnóstico de vencidos).
          </p>
          <div className="flex flex-col gap-1.5">
            <span className="font-ui text-[13px] font-semibold">Documento do PIE</span>
            <button
              type="button"
              onClick={() => setDocPickerOpen(true)}
              className={`w-full cursor-pointer rounded-ctl border border-line-strong bg-surface px-2.5 py-1.5 text-left text-sm hover:border-action ${
                linkDocumentId ? '' : 'text-muted'
              }`}
            >
              {linkDocumentName || 'Selecionar documento…'}
            </button>
          </div>

          <div className="rounded-card border border-line">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="font-ui text-[13px] font-semibold">
                Itens ({linkSelection.size} selecionado{linkSelection.size === 1 ? '' : 's'})
              </span>
              <button
                type="button"
                onClick={() =>
                  setLinkSelection(
                    linkSelection.size === rows.length
                      ? new Set()
                      : new Set(rows.map((row) => row.id)),
                  )
                }
                className="cursor-pointer font-ui text-[12.5px] font-medium text-action hover:underline"
              >
                {linkSelection.size === rows.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>
            <ul className="max-h-56 overflow-y-auto p-2">
              {rows.length === 0 && (
                <li className="px-1 py-2 text-sm text-muted">Nenhum item cadastrado.</li>
              )}
              {rows.map((row) => {
                const current = linkDialog
                  ? linkByItemField.get(`${row.id}:${linkDialog.field.key}`)
                  : undefined;
                return (
                  <li key={row.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-ctl px-1.5 py-1 text-sm hover:bg-paper">
                      <input
                        type="checkbox"
                        checked={linkSelection.has(row.id)}
                        onChange={(e) =>
                          setLinkSelection((state) => {
                            const next = new Set(state);
                            if (e.target.checked) next.add(row.id);
                            else next.delete(row.id);
                            return next;
                          })
                        }
                        className="size-4 accent-[var(--color-action)]"
                      />
                      <span className="flex-1">{row.name}</span>
                      {current && (
                        <span className="truncate text-[12px] text-muted">
                          atual: {current.documentName}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          {linkDocument.error && (
            <p role="alert" className="text-sm text-bad">
              {linkDocument.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setLinkDialog(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!linkDocumentId || linkSelection.size === 0 || linkDocument.isPending}
              onClick={() =>
                linkDialog &&
                linkDocument.mutate({
                  unitId,
                  fieldKey: linkDialog.field.key,
                  documentId: linkDocumentId,
                  employeeIds: isEmployees ? [...linkSelection] : [],
                  equipmentIds: isEmployees ? [] : [...linkSelection],
                })
              }
            >
              {linkDocument.isPending
                ? 'Vinculando…'
                : `Vincular ${linkSelection.size} item(ns)`}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Navegação começa na raiz da pasta do grupo (ex.: Equipamentos/EPI). */}
      <DocumentPickerDialog
        unitId={unitId}
        open={docPickerOpen}
        onClose={() => setDocPickerOpen(false)}
        startPath={registerBasePath[target].slice(0, -1)}
        selectedId={linkDocumentId || null}
        onSelect={(doc) => {
          setLinkDocumentId(doc.id);
          setLinkDocumentName(doc.name);
        }}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        unitId={unitId}
        isEmployees={isEmployees}
        equipmentTab={equipmentTab}
        fields={allFields}
        onImported={invalidate}
      />

      {/* — Excluir — */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={`Excluir ${itemLabel}`}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Excluir <strong>{deleteTarget?.name}</strong>? A pasta no PIE e os documentos não
            são afetados.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={removeEmployee.isPending || removeEquipment.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                if (isEmployees) removeEmployee.mutate({ unitId, employeeId: deleteTarget.id });
                else removeEquipment.mutate({ unitId, equipmentId: deleteTarget.id });
              }}
            >
              Excluir
            </Button>
          </div>
        </div>
      </Dialog>

      {/* — Configuração do grupo: campos personalizados + estrutura padrão — */}
      <Dialog
        open={fieldsOpen}
        onClose={() => setFieldsOpen(false)}
        title={`Configurar grupo — ${registerTargetLabels[target]}`}
      >
        <div className="flex flex-col gap-4">
          <SelectField
            label="Estrutura de pastas padrão do grupo"
            hint="Vem pré-selecionada ao criar um item deste grupo (o usuário pode trocar ou remover)"
            value={defaultSchemaFor(target)}
            onChange={(e) =>
              setTargetSetting.mutate({
                unitId,
                target,
                folderSchemaId: e.target.value || null,
              })
            }
          >
            <option value="">Sem estrutura padrão</option>
            {schemas.data?.map((schemaItem) => (
              <option key={schemaItem.id} value={schemaItem.id}>
                {schemaItem.name}
              </option>
            ))}
          </SelectField>

          <p className="text-sm text-muted">
            Campos padrão do sistema: <strong>{defaults.map((f) => f.label).join(', ')}</strong>.
            Os campos abaixo valem para {registerTargetLabels[target].toLowerCase()} desta
            unidade.
          </p>
          <ul className="flex flex-col gap-1.5">
            {customFields.data?.length === 0 && (
              <li className="text-sm text-muted">Nenhum campo personalizado.</li>
            )}
            {customFields.data?.map((field) => (
              <li
                key={field.id}
                className="group flex items-center justify-between rounded-ctl border border-line px-3 py-1.5 text-sm"
              >
                {field.name}
                <button
                  type="button"
                  title="Remover campo"
                  aria-label={`Remover campo ${field.name}`}
                  onClick={() => removeField.mutate({ unitId, customFieldId: field.id })}
                  className="cursor-pointer rounded-ctl p-1 text-muted opacity-0 transition-opacity hover:bg-bad-soft hover:text-bad group-hover:opacity-100"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newField.trim()) {
                addField.mutate({ unitId, target, name: newField.trim() });
              }
            }}
            className="flex items-end gap-2"
          >
            <Field
              label="Novo campo"
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              placeholder="Ex.: Setor, Nº de série…"
              className="flex-1"
            />
            <Button type="submit" disabled={!newField.trim() || addField.isPending}>
              <Plus aria-hidden className="size-4" /> Adicionar
            </Button>
          </form>
          {addField.error && (
            <p role="alert" className="text-sm text-bad">
              {addField.error.message}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => setFieldsOpen(false)}>
              Fechar
            </Button>
          </div>
        </div>
      </Dialog>
    </Page>
  );
}

export function ColaboradoresPage() {
  return <RegisterPage module="colaboradores" />;
}

export function EquipamentosPage() {
  return <RegisterPage module="equipamentos" />;
}
