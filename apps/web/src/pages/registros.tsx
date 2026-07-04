import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import * as XLSX from 'xlsx';
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
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FolderIcon } from '@/components/ui/icons';
import { Page } from '@/components/ui/page';
import { SelectField } from '@/components/ui/select';
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
  const { ord, dir } = useSearch({ strict: false }) as SortState;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [equipmentTab, setEquipmentTab] = useState<EquipmentType>('eletrico');
  const target: RegisterTarget = isEmployees ? 'colaboradores' : equipmentTab;
  const defaults = defaultRegisterFields[target];
  const documentFields = defaults.filter((field) => field.kind === 'document');

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
  const unitDocuments = useQuery({
    ...trpc.documents.listBySubtree.queryOptions({ unitId, folderId: null }),
    enabled: documentFields.length > 0,
  });

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

  function openEditor(row: RegisterRow | 'new') {
    setEditing(row);
    setName(row === 'new' ? '' : row.name);
    setMetadata(row === 'new' ? {} : (row.metadata ?? {}));
    setFolderSchemaId('');
  }

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
        type: equipmentTab,
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

  // — Vincular documento (campos kind=document) —
  const [linkDialog, setLinkDialog] = useState<{
    field: RegisterField;
    preselected?: string;
  } | null>(null);
  const [linkDocumentId, setLinkDocumentId] = useState('');
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
    setLinkDocumentId(
      preselected ? (linkByItemField.get(`${preselected}:${field.key}`)?.documentId ?? '') : '',
    );
  }

  // — Importação por planilha —
  const [importOpen, setImportOpen] = useState(false);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sheetRows, setSheetRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [importResult, setImportResult] = useState<string | null>(null);

  const textFields = [
    ...defaults.filter((field) => field.kind !== 'document'),
    ...(customFields.data ?? []).map((field) => ({ key: field.name, label: field.name })),
  ];
  const mappableFields = [{ key: '__name', label: 'Nome' }, ...textFields];

  async function loadSheet(file: File) {
    // codepage 65001 = UTF-8 (CSVs sem BOM viravam mojibake).
    const workbook = XLSX.read(await file.arrayBuffer(), { raw: false, codepage: 65001 });
    const sheet = workbook.Sheets[workbook.SheetNames[0]!];
    const grid: string[][] = sheet
      ? XLSX.utils
          .sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
          .map((row) => row.map((cell) => String(cell ?? '').trim()))
      : [];
    const headers = (grid[0] ?? []).map(String);
    setSheetHeaders(headers);
    setSheetRows(grid.slice(1).filter((row) => row.some((cell) => cell)));
    // De-para automático por nome normalizado.
    const auto: Record<string, number> = {};
    for (const field of mappableFields) {
      const wanted = normalize(field.label);
      const index = headers.findIndex(
        (header) => normalize(header) === wanted || normalize(header).includes(wanted),
      );
      if (index >= 0) auto[field.key] = index;
    }
    setMapping(auto);
    setImportResult(null);
  }

  const importEmployees = useMutation(
    trpc.registers.importEmployees.mutationOptions({
      onSuccess: (result) => {
        setImportResult(`${result.created} criado(s), ${result.updated} atualizado(s).`);
        invalidate();
      },
    }),
  );
  const importEquipment = useMutation(
    trpc.registers.importEquipment.mutationOptions({
      onSuccess: (result) => {
        setImportResult(`${result.created} criado(s), ${result.updated} atualizado(s).`);
        invalidate();
      },
    }),
  );
  const importing = importEmployees.isPending || importEquipment.isPending;

  function runImport() {
    const nameIndex = mapping['__name'];
    if (nameIndex === undefined) return;
    const items = sheetRows
      .map((row) => ({
        name: row[nameIndex] ?? '',
        metadata: Object.fromEntries(
          textFields
            .filter((field) => mapping[field.key] !== undefined)
            .map((field) => [field.key, row[mapping[field.key]!] ?? ''])
            .filter(([, value]) => value),
        ),
      }))
      .filter((item) => item.name);
    if (items.length === 0) return;
    if (isEmployees) importEmployees.mutate({ unitId, items });
    else importEquipment.mutate({ unitId, type: equipmentTab, items });
  }

  const allFields = [...defaults, ...(customFields.data ?? []).map((f) => ({ key: f.name, label: f.name }))];
  const basePathLabel = registerBasePath[target].join(' / ');

  // Ordenação (?ord=&dir=): nome, campos (default+personalizados) e pasta.
  // Campos kind=document ordenam pelo nome do documento vinculado.
  const currentOrd = ord ?? 'nome';
  const currentDir = dir ?? 'asc';
  const fieldAccessor = (field: RegisterField) => (row: RegisterRow): SortValue => {
    if (field.kind === 'document') {
      const link = linkByItemField.get(`${row.id}:${field.key}`);
      return link ? normalize(link.documentName) : null;
    }
    const value = row.metadata?.[field.key];
    return value ? normalize(value) : null;
  };
  const accessors: Record<string, (row: RegisterRow) => SortValue> = {
    nome: (row) => normalize(row.name),
    pasta: (row) => (row.folderName ? normalize(row.folderName) : null),
    ...Object.fromEntries(
      allFields.map((field) => [`campo:${field.key}`, fieldAccessor(field as RegisterField)]),
    ),
  };
  const sorted = sortRows(rows, accessors[currentOrd] ?? accessors.nome!, currentDir);
  const handleSort = (key: string) =>
    navigate({
      to: isEmployees ? '/$companyId/$unitId/colaboradores' : '/$companyId/$unitId/equipamentos',
      params: { companyId, unitId },
      search: toggleSort({ ord, dir }, key, 'nome'),
    });

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Cadastros</p>
          <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => { setImportOpen(true); setSheetHeaders([]); setSheetRows([]); setImportResult(null); }}>
            <FileSpreadsheet aria-hidden className="size-4" /> Importar planilha
          </Button>
          <Button variant="secondary" onClick={() => setFieldsOpen(true)}>
            <Settings2 aria-hidden className="size-4" /> Campos personalizados
          </Button>
          {documentFields.map((field) => (
            <Button key={field.key} variant="secondary" onClick={() => openLinkDialog(field)}>
              <Link2 aria-hidden className="size-4" /> Vincular {field.label}
            </Button>
          ))}
          <Button onClick={() => openEditor('new')}>
            {isEmployees ? (
              <UserPlus aria-hidden className="size-4" />
            ) : (
              <Wrench aria-hidden className="size-4" />
            )}
            Novo {itemLabel}
          </Button>
        </div>
      </div>

      {!isEmployees && (
        <div
          role="tablist"
          aria-label="Tipo de equipamento"
          className="flex w-fit items-center gap-0.5 rounded-ctl bg-paper p-0.5"
        >
          {equipmentTypes.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={equipmentTab === value}
              onClick={() => setEquipmentTab(value)}
              className={`rounded-[3px] px-3 py-1.5 font-ui text-[13px] font-semibold ${
                equipmentTab === value
                  ? 'bg-surface text-action shadow-sm'
                  : 'cursor-pointer text-muted hover:text-ink'
              }`}
            >
              {registerTargetLabels[value]}
            </button>
          ))}
        </div>
      )}

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
                  if ((field as RegisterField).kind === 'document') {
                    const link = linkByItemField.get(`${row.id}:${field.key}`);
                    return (
                      <td key={field.key} className="border-b border-line px-3.5 py-2.5">
                        {link ? (
                          <span
                            className={`inline-flex max-w-56 items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 font-ui text-[12.5px] font-semibold ${expiryTone(link)}`}
                          >
                            <button
                              type="button"
                              title={`Trocar documento de ${field.label}`}
                              onClick={() => openLinkDialog(field as RegisterField, row.id)}
                              className="cursor-pointer truncate hover:underline"
                            >
                              {link.documentName}
                            </button>
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
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openLinkDialog(field as RegisterField, row.id)}
                            className="cursor-pointer rounded-full border border-dashed border-line-strong px-2.5 py-0.5 font-ui text-[12.5px] font-medium text-muted hover:border-action hover:text-action"
                          >
                            Vincular…
                          </button>
                        )}
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
            <p className="text-[13px] text-muted">
              Tipo: <strong>{equipmentTypeLabels[equipmentTab]}</strong> (aba selecionada)
            </p>
          )}
          <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {textFields.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              value={metadata[field.key] ?? ''}
              onChange={(e) =>
                setMetadata((state) => ({ ...state, [field.key]: e.target.value }))
              }
            />
          ))}
          {documentFields.length > 0 && (
            <p className="text-[13px] text-muted">
              {documentFields.map((f) => f.label).join(', ')}: vincule pelo botão "Vincular" na
              lista (documento do PIE, pode cobrir vários itens).
            </p>
          )}
          {editing === 'new' && (
            <div className="rounded-card border border-line bg-paper p-3">
              <p className="text-[13px] text-ink-soft">
                A pasta <strong>{name.trim() || `do ${itemLabel}`}</strong> será criada
                automaticamente em <strong>{basePathLabel}</strong>.
              </p>
              <SelectField
                label="Estrutura de pastas dentro da pasta do item (opcional)"
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
          <SelectField
            label="Documento do PIE"
            value={linkDocumentId}
            onChange={(e) => setLinkDocumentId(e.target.value)}
          >
            <option value="">Selecionar documento…</option>
            {unitDocuments.data?.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.name}
                {doc.expiresAt
                  ? ` (vence ${new Date(`${doc.expiresAt}T00:00:00`).toLocaleDateString('pt-BR')})`
                  : ''}
              </option>
            ))}
          </SelectField>

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

      {/* — Importar planilha — */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Importar planilha">
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <p className="text-sm text-muted">
            Envie um arquivo .xlsx ou .csv com cabeçalho na primeira linha e faça o de-para das
            colunas. Itens com nome já existente são atualizados.
            {!isEmployees && (
              <>
                {' '}
                Os itens entram como <strong>{registerTargetLabels[equipmentTab]}</strong> (aba
                selecionada).
              </>
            )}
          </p>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            aria-label="Arquivo da planilha"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) loadSheet(file);
            }}
            className="rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded-ctl file:border-0 file:bg-action-soft file:px-3 file:py-1 file:font-ui file:text-[13px] file:font-semibold file:text-action"
          />

          {sheetHeaders.length > 0 && (
            <>
              <p className="text-sm">
                <strong>{sheetRows.length}</strong> linha(s) encontradas. Mapeie as colunas:
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {mappableFields.map((field) => (
                  <SelectField
                    key={field.key}
                    label={`${field.label}${field.key === '__name' ? ' (obrigatório)' : ''}`}
                    value={mapping[field.key] !== undefined ? String(mapping[field.key]) : ''}
                    onChange={(e) =>
                      setMapping((state) => {
                        const next = { ...state };
                        if (e.target.value === '') delete next[field.key];
                        else next[field.key] = Number(e.target.value);
                        return next;
                      })
                    }
                  >
                    <option value="">Ignorar</option>
                    {sheetHeaders.map((header, index) => (
                      <option key={`${header}-${index}`} value={index}>
                        {header || `Coluna ${index + 1}`}
                      </option>
                    ))}
                  </SelectField>
                ))}
              </div>
            </>
          )}

          {importResult && <p className="text-sm font-medium text-ok">{importResult}</p>}
          {(importEmployees.error || importEquipment.error) && (
            <p role="alert" className="text-sm text-bad">
              {importEmployees.error?.message ?? importEquipment.error?.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setImportOpen(false)}>
              Fechar
            </Button>
            <Button
              type="button"
              disabled={mapping['__name'] === undefined || sheetRows.length === 0 || importing}
              onClick={runImport}
            >
              {importing ? 'Importando…' : 'Importar'}
            </Button>
          </div>
        </div>
      </Dialog>

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

      {/* — Campos personalizados (por grupo-alvo) — */}
      <Dialog
        open={fieldsOpen}
        onClose={() => setFieldsOpen(false)}
        title={`Campos personalizados — ${registerTargetLabels[target]}`}
      >
        <div className="flex flex-col gap-4">
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
