import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
  Check,
  ClipboardCheck,
  FileText,
  History,
  Link2,
  ListChecks,
  PenLine,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  authorizationEventLabels,
  authorizationStatusLabels,
  authorizationTypeLabels,
  normalizeText,
  type AuthorizationStatus,
  type AuthorizationType,
  type EpiSheetDetails,
  type WorkPermitDetails,
} from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { formatDate, formatDateTime } from '@/lib/format';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { useDialogMutation, useDialogTarget } from '@/lib/use-dialog-mutation';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Page, PageTitle } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import { SelectField } from '@/components/ui/select';
import { Td } from '@/components/ui/table';
import { SignaturePad } from '@/components/autorizacoes/signature-pad';
import {
  PlainTh,
  SortableTh,
  sortRows,
  toggleSort,
  type SortState,
  type SortValue,
} from '@/components/ui/sortable';

// Autorizações (seção própria): Autorização de Trabalho e Ficha de EPI. O
// operador escolhe o colaborador e gera o documento; a assinatura é presencial
// (canvas aqui) ou pelo link público /assinar/<token> (colaborador sem acesso
// ao sistema). Assinado, o PDF com trilha de auditoria entra na pasta do
// colaborador no P.I.E e fica acessível também por esta tela. As atividades
// marcáveis da Autorização de Trabalho vêm do catálogo da unidade (AtividadesPage,
// em pages/atividades.tsx) — CRUD próprio acessível pelo botão "Atividades"
// ao lado de "Nova".

export const authorizationTabs = ['permissao-trabalho', 'ficha-epi'] as const;
export type AuthorizationTab = (typeof authorizationTabs)[number];

const tabToType: Record<AuthorizationTab, AuthorizationType> = {
  'permissao-trabalho': 'permissao_trabalho',
  'ficha-epi': 'ficha_epi',
};

interface AuthorizationRow {
  id: string;
  employeeId: string;
  employeeName: string;
  details: WorkPermitDetails | EpiSheetDetails;
  status: AuthorizationStatus;
  signToken: string;
  signedAt: string | null;
  documentId: string | null;
  documentName: string | null;
  createdAt: string;
}

const statusColors: Record<AuthorizationStatus, string> = {
  pendente: 'text-warn bg-warn-soft',
  assinada: 'text-ok bg-ok-soft',
  cancelada: 'text-muted bg-idle-soft',
};

function summary(type: AuthorizationType, details: AuthorizationRow['details']) {
  if (type === 'permissao_trabalho') {
    const pt = details as WorkPermitDetails;
    return [pt.atividades.join(', '), pt.local].filter(Boolean).join(' — ');
  }
  const epis = (details as EpiSheetDetails).epis;
  return `${epis.length} EPI${epis.length === 1 ? '' : 's'}: ${epis.map((epi) => epi.nome).join(', ')}`;
}

const rowActionClass = `cursor-pointer rounded-ctl p-1 text-muted opacity-0 transition-opacity
  hover:bg-line/60 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100`;

export function AutorizacoesPage() {
  const { companyId, unitId } = useParams({ strict: false }) as {
    companyId: string;
    unitId: string;
  };
  const { ord, dir, novo, tipo } = useSearch({ strict: false }) as SortState & {
    novo?: '1';
    tipo?: AuthorizationTab;
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const tab: AuthorizationTab = tipo ?? 'permissao-trabalho';
  const type = tabToType[tab];
  const typeLabel = authorizationTypeLabels[type];
  const isPermit = type === 'permissao_trabalho';

  const { can } = useUnitPermissions(unitId);
  const canGerar = can('autorizacoes.gerar');
  // Exclusão DEFINITIVA (registro + trilha + PDF): ação própria do papel,
  // pensada para erros que não podem aparecer a clientes/auditores.
  const canPurge = can('exclusao.definitiva');

  const list = useQuery(trpc.authorizations.list.queryOptions({ unitId, type }));
  const rows = (list.data ?? []) as AuthorizationRow[];
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.authorizations.list.queryKey({ unitId, type }),
    });

  // — Nova autorização —
  const [createOpen, setCreateOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [atividadesSelected, setAtividadesSelected] = useState<Set<string>>(new Set());
  const [local, setLocal] = useState('');
  const [validade, setValidade] = useState('');
  const [episSelected, setEpisSelected] = useState<Set<string>>(new Set());
  const employees = useQuery({
    ...trpc.registers.listEmployees.queryOptions({ unitId }),
    enabled: createOpen,
  });
  // Ficha de EPI parte do cadastro de EPIs da unidade (nome + CA).
  const equipment = useQuery({
    ...trpc.registers.listEquipment.queryOptions({ unitId }),
    enabled: createOpen && !isPermit,
  });
  const epis = (equipment.data ?? []).filter((row) => row.type === 'epi');
  // Autorização de Trabalho: atividade não é digitada — marca-se no
  // checklist do catálogo cadastrado em Atividades (mesma origem do botão).
  const activities = useQuery({
    ...trpc.authorizations.listActivities.queryOptions({ unitId }),
    enabled: createOpen && isPermit,
  });

  function openCreate() {
    setCreateOpen(true);
    setEmployeeId('');
    setAtividadesSelected(new Set());
    setLocal('');
    setValidade('');
    setEpisSelected(new Set());
  }

  const create = useDialogMutation(trpc.authorizations.create.mutationOptions(), () => {
    setCreateOpen(false);
    invalidate();
  });

  function saveCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!employeeId) return;
    if (isPermit) {
      create.mutate({
        unitId,
        type: 'permissao_trabalho',
        employeeId,
        details: {
          atividades: (activities.data ?? [])
            .filter((activity) => atividadesSelected.has(activity.id))
            .map((activity) => activity.name),
          local: local.trim() || undefined,
          validade: validade || undefined,
        },
      });
    } else {
      create.mutate({
        unitId,
        type: 'ficha_epi',
        employeeId,
        details: {
          epis: epis
            .filter((epi) => episSelected.has(epi.id))
            .map((epi) => ({ nome: epi.name, ca: epi.metadata?.ca || undefined })),
        },
      });
    }
  }

  const createValid =
    employeeId && (isPermit ? atividadesSelected.size > 0 : episSelected.size > 0);

  // Botão "Novo" da sidebar (?novo=1): abre o editor e limpa o flag.
  useEffect(() => {
    if (!novo) return;
    openCreate();
    navigate({
      to: '/$companyId/$unitId/autorizacoes',
      params: { companyId, unitId },
      search: { tipo: tab, ord, dir },
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novo]);

  // — Assinatura presencial —
  const signDialog = useDialogTarget<AuthorizationRow>();
  const [signature, setSignature] = useState<string | null>(null);
  const sign = useDialogMutation(trpc.authorizations.signInPerson.mutationOptions(), () => {
    signDialog.close();
    invalidate();
  });
  function openSign(row: AuthorizationRow) {
    setSignature(null);
    signDialog.open(row);
  }

  // — Link público de assinatura —
  const [copiedId, setCopiedId] = useState<string | null>(null);
  function copyLink(row: AuthorizationRow) {
    navigator.clipboard.writeText(`${window.location.origin}/assinar/${row.signToken}`).then(() => {
      setCopiedId(row.id);
      setTimeout(() => setCopiedId((current) => (current === row.id ? null : current)), 2000);
    });
  }

  // — PDF assinado —
  const documentUrl = useDialogMutation(trpc.authorizations.documentUrl.mutationOptions(), () => {});
  function openDocument(row: AuthorizationRow) {
    documentUrl.mutate(
      { unitId, authorizationId: row.id },
      { onSuccess: ({ url }) => window.open(url, '_blank', 'noopener') },
    );
  }

  // — Trilha de auditoria —
  const trailDialog = useDialogTarget<AuthorizationRow>();
  const trail = useQuery({
    ...trpc.authorizations.events.queryOptions({
      unitId,
      authorizationId: trailDialog.target?.id ?? '',
    }),
    enabled: trailDialog.isOpen,
  });

  // — Cancelar —
  const cancelDialog = useDialogTarget<AuthorizationRow>();
  const cancel = useDialogMutation(trpc.authorizations.cancel.mutationOptions(), () => {
    cancelDialog.close();
    invalidate();
  });

  // — Excluir definitivamente —
  const purgeDialog = useDialogTarget<AuthorizationRow>();
  const purge = useDialogMutation(trpc.authorizations.remove.mutationOptions(), () => {
    purgeDialog.close();
    invalidate();
  });

  // Ordenação (?ord=&dir=).
  const currentOrd = ord ?? 'criada';
  const currentDir = dir ?? 'desc';
  const accessors: Record<string, (row: AuthorizationRow) => SortValue> = {
    colaborador: (row) => normalizeText(row.employeeName),
    status: (row) => row.status,
    criada: (row) => row.createdAt,
    assinada: (row) => row.signedAt,
  };
  const sorted = sortRows(rows, accessors[currentOrd] ?? accessors.criada!, currentDir);
  const handleSort = (key: string) =>
    navigate({
      to: '/$companyId/$unitId/autorizacoes',
      params: { companyId, unitId },
      search: { tipo: tab, ...toggleSort({ ord, dir }, key, 'criada') },
    });

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Autorizações</p>
          <PageTitle>{typeLabel}</PageTitle>
        </div>
        <div className="flex items-center gap-2">
          {isPermit && canGerar && (
            <Link
              to="/$companyId/$unitId/atividades"
              params={{ companyId, unitId }}
              className="inline-flex items-center gap-2 rounded-ctl border border-line-strong
                bg-surface px-4 py-2 font-ui text-sm font-semibold text-ink hover:bg-paper"
            >
              <ListChecks aria-hidden className="size-4" /> Atividades
            </Link>
          )}
          {canGerar && (
            <Button onClick={openCreate}>
              <Plus aria-hidden className="size-4" /> Nova
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <SortableTh colKey="colaborador" label="Colaborador" ord={currentOrd} dir={currentDir} onSort={handleSort} />
              <PlainTh label={isPermit ? 'Atividades' : 'EPIs entregues'} />
              <SortableTh colKey="status" label="Status" ord={currentOrd} dir={currentDir} onSort={handleSort} />
              <SortableTh colKey="criada" label="Criada em" ord={currentOrd} dir={currentDir} onSort={handleSort} />
              <SortableTh colKey="assinada" label="Assinada em" ord={currentOrd} dir={currentDir} onSort={handleSort} />
              <PlainTh label="Documento" />
              <PlainTh />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3.5 py-12 text-center text-muted">
                  Nenhuma {typeLabel.toLowerCase()} gerada ainda
                  {canGerar ? ' — clique em "Nova" para começar.' : '.'}
                </td>
              </tr>
            )}
            {sorted.map((row) => (
              <tr key={row.id} className="group hover:bg-paper">
                <Td className="font-medium">{row.employeeName}</Td>
                <Td className="max-w-80 text-ink-soft">
                  <span className="line-clamp-2">{summary(type, row.details)}</span>
                </Td>
                <Td>
                  <Pill
                    label={authorizationStatusLabels[row.status]}
                    className={statusColors[row.status]}
                  />
                </Td>
                <Td className="whitespace-nowrap text-ink-soft">{formatDate(row.createdAt)}</Td>
                <Td className="whitespace-nowrap text-ink-soft">
                  {row.signedAt ? formatDateTime(row.signedAt) : '—'}
                </Td>
                <Td>
                  {row.documentId ? (
                    <button
                      type="button"
                      onClick={() => openDocument(row)}
                      className="flex max-w-64 cursor-pointer items-center gap-1.5 text-caption
                        text-muted hover:text-action hover:underline"
                    >
                      <FileText aria-hidden className="size-3.5 shrink-0" />
                      <span className="truncate">{row.documentName}</span>
                    </button>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-0.5">
                    {row.status === 'pendente' && canGerar && (
                      <>
                        <button
                          type="button"
                          title="Assinar agora (presencial)"
                          aria-label={`Assinar autorização de ${row.employeeName}`}
                          onClick={() => openSign(row)}
                          className={rowActionClass}
                        >
                          <PenLine aria-hidden className="size-4" />
                        </button>
                        <button
                          type="button"
                          title={copiedId === row.id ? 'Link copiado!' : 'Copiar link de assinatura'}
                          aria-label={`Copiar link de assinatura de ${row.employeeName}`}
                          onClick={() => copyLink(row)}
                          className={`${rowActionClass} ${copiedId === row.id ? 'text-ok opacity-100' : ''}`}
                        >
                          {copiedId === row.id ? (
                            <Check aria-hidden className="size-4" />
                          ) : (
                            <Link2 aria-hidden className="size-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          title="Cancelar autorização"
                          aria-label={`Cancelar autorização de ${row.employeeName}`}
                          onClick={() => cancelDialog.open(row)}
                          className={rowActionClass}
                        >
                          <X aria-hidden className="size-4" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      title="Trilha de auditoria"
                      aria-label={`Trilha de auditoria de ${row.employeeName}`}
                      onClick={() => trailDialog.open(row)}
                      className={rowActionClass}
                    >
                      <History aria-hidden className="size-4" />
                    </button>
                    {canPurge && (
                      <button
                        type="button"
                        title="Excluir definitivamente"
                        aria-label={`Excluir definitivamente a autorização de ${row.employeeName}`}
                        onClick={() => purgeDialog.open(row)}
                        className={`${rowActionClass} hover:bg-bad-soft hover:text-bad`}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* — Nova autorização — */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={`Nova ${typeLabel}`}>
        <form onSubmit={saveCreate} className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <SelectField
            label="Colaborador"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            hint="O PDF assinado será salvo na pasta do colaborador no P.I.E"
            autoFocus
          >
            <option value="">Selecionar colaborador…</option>
            {employees.data?.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </SelectField>

          {isPermit ? (
            <>
              <div className="rounded-card border border-line">
                <div className="flex items-center justify-between border-b border-line px-3 py-2">
                  <span className="font-ui text-caption font-semibold">
                    Atividades autorizadas ({atividadesSelected.size} selecionada
                    {atividadesSelected.size === 1 ? '' : 's'})
                  </span>
                </div>
                <ul className="max-h-56 overflow-y-auto p-2">
                  {(activities.data ?? []).length === 0 && (
                    <li className="px-1 py-2 text-sm text-muted">
                      Nenhuma atividade cadastrada — cadastre pelo botão{' '}
                      <Link
                        to="/$companyId/$unitId/atividades"
                        params={{ companyId, unitId }}
                        className="text-action hover:underline"
                      >
                        Atividades
                      </Link>
                      .
                    </li>
                  )}
                  {activities.data?.map((atividade) => (
                    <li key={atividade.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-ctl px-1.5 py-1 text-sm hover:bg-paper">
                        <input
                          type="checkbox"
                          checked={atividadesSelected.has(atividade.id)}
                          onChange={(e) =>
                            setAtividadesSelected((state) => {
                              const next = new Set(state);
                              if (e.target.checked) next.add(atividade.id);
                              else next.delete(atividade.id);
                              return next;
                            })
                          }
                          className="size-4 accent-[var(--color-action)]"
                        />
                        <span className="flex-1">{atividade.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <Field label="Local (opcional)" value={local} onChange={(e) => setLocal(e.target.value)} />
              <Field
                label="Válida até (opcional)"
                type="date"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
              />
            </>
          ) : (
            <div className="rounded-card border border-line">
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="font-ui text-caption font-semibold">
                  EPIs entregues ({episSelected.size} selecionado{episSelected.size === 1 ? '' : 's'})
                </span>
              </div>
              <ul className="max-h-56 overflow-y-auto p-2">
                {epis.length === 0 && (
                  <li className="px-1 py-2 text-sm text-muted">
                    Nenhum EPI cadastrado — cadastre em Cadastros → Equipamentos → EPI.
                  </li>
                )}
                {epis.map((epi) => (
                  <li key={epi.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-ctl px-1.5 py-1 text-sm hover:bg-paper">
                      <input
                        type="checkbox"
                        checked={episSelected.has(epi.id)}
                        onChange={(e) =>
                          setEpisSelected((state) => {
                            const next = new Set(state);
                            if (e.target.checked) next.add(epi.id);
                            else next.delete(epi.id);
                            return next;
                          })
                        }
                        className="size-4 accent-[var(--color-action)]"
                      />
                      <span className="flex-1">{epi.name}</span>
                      {epi.metadata?.ca && (
                        <span className="font-mono text-label text-muted">CA {epi.metadata.ca}</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {create.error && (
            <p role="alert" className="text-sm text-bad">
              {create.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!createValid || create.isPending}>
              {create.isPending ? 'Gerando…' : 'Gerar para assinatura'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* — Assinatura presencial — */}
      <Dialog
        open={signDialog.isOpen}
        onClose={signDialog.close}
        title={`Assinar ${typeLabel.toLowerCase()}`}
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-card border border-line bg-paper p-3 text-sm">
            <p>
              <strong>{signDialog.target?.employeeName}</strong> assina abaixo, no seu dispositivo.
            </p>
            {signDialog.target && (
              <p className="mt-1 text-ink-soft">{summary(type, signDialog.target.details)}</p>
            )}
          </div>
          <SignaturePad
            key={signDialog.target?.id}
            signerName={signDialog.target?.employeeName ?? ''}
            onChange={setSignature}
          />
          {sign.error && (
            <p role="alert" className="text-sm text-bad">
              {sign.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={signDialog.close}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!signature || sign.isPending}
              onClick={() =>
                signDialog.target &&
                signature &&
                sign.mutate({ unitId, authorizationId: signDialog.target.id, signature })
              }
            >
              <ClipboardCheck aria-hidden className="size-4" />
              {sign.isPending ? 'Gerando PDF…' : 'Confirmar assinatura'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* — Trilha de auditoria (mesma ficha impressa no PDF) — */}
      <Dialog open={trailDialog.isOpen} onClose={trailDialog.close} title="Trilha de auditoria">
        <div className="flex flex-col gap-4">
          <div className="rounded-card border border-line">
            <p className="border-b border-line px-4 py-2.5 font-ui text-caption font-semibold">
              Detalhes
            </p>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 px-4 py-3 text-sm">
              <dt className="font-mono text-micro uppercase tracking-[.08em] text-muted">
                Documento
              </dt>
              <dd>{trailDialog.target?.documentName ?? `${typeLabel} (ainda não assinada)`}</dd>
              <dt className="font-mono text-micro uppercase tracking-[.08em] text-muted">Status</dt>
              <dd>
                {trailDialog.target && (
                  <Pill
                    label={authorizationStatusLabels[trailDialog.target.status]}
                    className={statusColors[trailDialog.target.status]}
                  />
                )}
              </dd>
            </dl>
          </div>
          <div className="rounded-card border border-line">
            <p className="border-b border-line px-4 py-2.5 font-ui text-caption font-semibold">
              Atividade
            </p>
            <ul className="divide-y divide-line px-4">
              {trail.data?.map((event) => (
                <li key={event.id} className="flex items-baseline gap-4 py-2.5 text-sm">
                  <span className="w-24 shrink-0 font-mono text-micro uppercase tracking-[.08em] text-muted">
                    {authorizationEventLabels[event.type]}
                  </span>
                  <span className="flex-1">{event.actor}</span>
                  <span className="shrink-0 whitespace-nowrap text-caption text-muted">
                    {formatDateTime(event.createdAt)}
                  </span>
                </li>
              ))}
              {trail.isSuccess && trail.data.length === 0 && (
                <li className="py-2.5 text-sm text-muted">Sem eventos.</li>
              )}
            </ul>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={trailDialog.close}>
              Fechar
            </Button>
          </div>
        </div>
      </Dialog>

      {/* — Excluir definitivamente — */}
      <Dialog
        open={purgeDialog.isOpen}
        onClose={purgeDialog.close}
        title="Excluir definitivamente"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Excluir definitivamente a {typeLabel.toLowerCase()} de{' '}
            <strong>{purgeDialog.target?.employeeName}</strong>? O registro, a trilha de auditoria
            {purgeDialog.target?.documentId ? ' e o PDF assinado no P.I.E' : ''} são apagados do
            sistema — <strong>sem recuperação</strong>.
          </p>
          {purge.error && (
            <p role="alert" className="text-sm text-bad">
              {purge.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={purgeDialog.close}>
              Voltar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={purge.isPending}
              onClick={() =>
                purgeDialog.target &&
                purge.mutate({ unitId, authorizationId: purgeDialog.target.id })
              }
            >
              {purge.isPending ? 'Excluindo…' : 'Excluir definitivamente'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* — Cancelar — */}
      <Dialog open={cancelDialog.isOpen} onClose={cancelDialog.close} title="Cancelar autorização">
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Cancelar a {typeLabel.toLowerCase()} de{' '}
            <strong>{cancelDialog.target?.employeeName}</strong>? O link de assinatura deixa de
            funcionar e a autorização fica registrada como cancelada.
          </p>
          {cancel.error && (
            <p role="alert" className="text-sm text-bad">
              {cancel.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={cancelDialog.close}>
              Voltar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={cancel.isPending}
              onClick={() =>
                cancelDialog.target &&
                cancel.mutate({ unitId, authorizationId: cancelDialog.target.id })
              }
            >
              {cancel.isPending ? 'Cancelando…' : 'Cancelar autorização'}
            </Button>
          </div>
        </div>
      </Dialog>
    </Page>
  );
}
