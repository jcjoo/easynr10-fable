import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronRight, FileText, ImageOff } from 'lucide-react';
import {
  diagnosticStatusScore,
  equipmentTypeLabels,
  scoreToStatus,
  type DiagnosticStatus,
  type EquipmentType,
  type RegisterField,
} from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Dialog } from '@/components/ui/dialog';
import { FolderIcon } from '@/components/ui/icons';
import { StatusPill, adherenceDots, statusPillLabel } from '@/components/ui/status-pill';

export interface SheetLink {
  documentId: string;
  documentName: string;
  documentFolderId: string | null;
  adherence: DiagnosticStatus | null;
}

export interface SheetItem {
  id: string;
  name: string;
  type?: EquipmentType;
  folderId: string | null;
  folderName: string | null;
  metadata: Record<string, string>;
}

// Campos com `requires` só se aplicam quando a condição bate (ex.: SEP).
function applies(field: RegisterField, metadata: Record<string, string>) {
  if (!field.requires) return true;
  return metadata[field.requires.fieldKey] === field.requires.value;
}

function selectLabel(field: RegisterField, value: string | undefined) {
  if (!value) return '';
  return field.options?.find((option) => option.value === value)?.label ?? value;
}

// Ficha do item de cadastro: foto, dados de todas as colunas, documentos
// vinculados com suas notas e a aderência média (média das notas dos docs).
export function ItemSheetDialog({
  open,
  onClose,
  unitId,
  companyId,
  isEmployees,
  item,
  fields,
  documentFields,
  getLink,
  onPreview,
}: {
  open: boolean;
  onClose: () => void;
  unitId: string;
  companyId: string;
  isEmployees: boolean;
  item: SheetItem | null;
  fields: RegisterField[];
  documentFields: RegisterField[];
  getLink: (fieldKey: string) => SheetLink | undefined;
  onPreview: (documentId: string, name: string) => void;
}) {
  const photo = useQuery({
    ...trpc.registers.itemPhotoUrl.queryOptions({
      unitId,
      employeeId: isEmployees ? (item?.id ?? null) : null,
      equipmentId: isEmployees ? null : (item?.id ?? null),
    }),
    enabled: Boolean(item),
  });

  // Aderência média = média das notas dos documentos vinculados (sem nota ⇒ 0).
  const docRows = item
    ? documentFields
        .filter((field) => applies(field, item.metadata))
        .map((field) => ({ field, link: getLink(field.key) }))
    : [];
  const linkedNotas = docRows
    .filter((row) => row.link)
    .map((row) => (row.link!.adherence ? diagnosticStatusScore[row.link!.adherence] : 0));
  const average =
    linkedNotas.length > 0
      ? Math.round((linkedNotas.reduce((a, b) => a + b, 0) / linkedNotas.length) * 100)
      : null;

  // Colunas de dado (não-documento) com valor preenchido.
  const dataRows = item
    ? fields
        .filter((field) => field.kind !== 'document' && applies(field, item.metadata))
        .map((field) => ({
          label: field.label,
          value:
            field.kind === 'select'
              ? selectLabel(field, item.metadata[field.key])
              : (item.metadata[field.key] ?? ''),
        }))
        .filter((row) => row.value)
    : [];

  return (
    <Dialog open={open} onClose={onClose} title={item?.name ?? 'Ficha'} size="lg">
      {item && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-paper">
              {photo.data ? (
                <img src={photo.data} alt={item.name} className="size-full object-cover" />
              ) : (
                <ImageOff aria-hidden className="size-7 text-muted" />
              )}
            </div>
            <div className="flex min-w-40 flex-1 flex-col gap-2">
              {item.type && (
                <span className="w-fit rounded-full bg-idle-soft px-2 py-0.5 text-micro text-idle">
                  {equipmentTypeLabels[item.type]}
                </span>
              )}
              <div className="flex items-center gap-2">
                <span className="font-ui text-caption font-semibold text-muted">
                  Aderência média
                </span>
                {average !== null ? (
                  <>
                    <StatusPill status={scoreToStatus(average)} />
                    <span className="font-mono text-sm text-ink-soft">{average}%</span>
                  </>
                ) : (
                  <span className="text-sm text-muted">sem notas vinculadas</span>
                )}
              </div>
              {item.folderId && (
                <Link
                  to="/$companyId/$unitId/pie"
                  params={{ companyId, unitId }}
                  search={{ pasta: item.folderId }}
                  className="flex w-fit items-center gap-1 font-ui text-label font-medium text-muted hover:text-action"
                >
                  <FolderIcon aria-hidden className="size-4" /> Abrir pasta no P.I.E
                  <ChevronRight aria-hidden className="size-3.5" />
                </Link>
              )}
            </div>
          </div>

          {dataRows.length > 0 && (
            <div>
              <h3 className="mb-1.5 font-ui text-sm font-semibold">Dados</h3>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {dataRows.map((row) => (
                  <div key={row.label} className="flex justify-between gap-3 border-b border-line py-1">
                    <dt className="text-caption text-muted">{row.label}</dt>
                    <dd className="text-caption font-medium text-ink-soft">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div>
            <h3 className="mb-1.5 font-ui text-sm font-semibold">Documentos e notas</h3>
            {docRows.length === 0 ? (
              <p className="text-sm text-muted">Este cadastro não tem colunas de documento.</p>
            ) : (
              <ul className="flex flex-col">
                {docRows.map(({ field, link }) => (
                  <li
                    key={field.key}
                    className="flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-b-0"
                  >
                    <span className="min-w-40 flex-1 text-caption font-medium">{field.label}</span>
                    {link ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onPreview(link.documentId, link.documentName)}
                          className="flex max-w-64 cursor-pointer items-center gap-1 text-caption text-action hover:underline"
                          title="Visualizar documento"
                        >
                          <FileText aria-hidden className="size-3.5 shrink-0" />
                          <span className="min-w-0 truncate">{link.documentName}</span>
                        </button>
                        {link.adherence ? (
                          <span className="inline-flex items-center gap-1 text-caption text-muted">
                            <span
                              aria-hidden
                              className={`size-2 rounded-full ${adherenceDots[link.adherence]}`}
                            />
                            {statusPillLabel(link.adherence)}
                          </span>
                        ) : (
                          <span className="text-caption text-muted">sem nota</span>
                        )}
                      </>
                    ) : (
                      <span className="text-caption text-muted">não vinculado</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
