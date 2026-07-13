import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatBytes, formatDateTime } from '@easynr10/shared';
import { Dialog } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDialogTarget } from '@/lib/use-dialog-mutation';

// Histórico de versões do documento (RF09.2): enviar nova versão (o upload em
// si fica com a página, dona do input de arquivo), baixar/visualizar cada
// versão e restaurar uma antiga (reutiliza o storage_key — versões imutáveis).
// Com exclusao.definitiva, versões antigas podem ser APAGADAS do histórico.

export function DocumentVersionsDialog({
  unitId,
  target,
  uploading,
  canUpload,
  canRestore,
  canPurge,
  onClose,
  onUploadNewVersion,
  onDownload,
  onPreview,
  onDocumentsChanged,
}: {
  unitId: string;
  target: { id: string; name: string } | null;
  uploading: boolean;
  /** Permissões do papel na unidade — sem elas os botões de escrita somem. */
  canUpload: boolean;
  canRestore: boolean;
  canPurge: boolean;
  onClose: () => void;
  onUploadNewVersion: () => void;
  onDownload: (versionId: string) => void;
  onPreview: (versionId: string) => void;
  onDocumentsChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const versions = useQuery({
    ...trpc.documents.versions.queryOptions({ unitId, documentId: target?.id ?? '' }),
    enabled: Boolean(target),
  });
  const invalidateVersions = () => {
    if (target) {
      queryClient.invalidateQueries({
        queryKey: trpc.documents.versions.queryKey({ unitId, documentId: target.id }),
      });
    }
    onDocumentsChanged();
  };
  const restoreVersion = useMutation(
    trpc.documents.restoreVersion.mutationOptions({ onSuccess: invalidateVersions }),
  );
  // Exclusão definitiva de UMA versão do histórico (confirmação própria —
  // abre sobre este dialog, irmão depois no DOM fica por cima).
  const purgeConfirm = useDialogTarget<{ id: string; number: number }>();
  const removeVersion = useMutation(
    trpc.documents.removeVersion.mutationOptions({
      onSuccess: () => {
        purgeConfirm.close();
        invalidateVersions();
      },
    }),
  );

  return (
    <Dialog
      open={Boolean(target)}
      onClose={onClose}
      title="Histórico de versões"
      description={target?.name}
    >
      {canUpload && (
        <button
          type="button"
          disabled={uploading}
          onClick={onUploadNewVersion}
          className="mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-card border border-dashed border-line-strong py-3.5 font-ui text-sm font-semibold text-ink-soft hover:border-action hover:text-action disabled:opacity-50"
        >
          <Upload aria-hidden className="size-4" />
          {uploading ? 'Enviando…' : 'Enviar nova versão'}
        </button>
      )}
      {versions.isLoading ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <ul className="flex flex-col">
          {versions.data?.map((version, index) => (
            <li
              key={version.id}
              className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0"
            >
              <div className="flex items-baseline gap-3">
                <span className="tabular font-mono text-caption font-semibold">
                  v{version.number}
                </span>
                <span className="tabular font-mono text-label text-muted">
                  {formatBytes(version.sizeBytes)}
                </span>
                <span className="text-caption text-muted">
                  {version.uploadedBy ?? '—'} · {formatDateTime(version.createdAt)}
                </span>
                {index === 0 && (
                  <span className="rounded-full bg-action-soft px-2 py-0.5 font-ui text-micro font-semibold text-action">
                    atual
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onPreview(version.id)}
                  className="cursor-pointer font-ui text-caption font-semibold text-action hover:underline"
                >
                  Visualizar
                </button>
                <button
                  type="button"
                  onClick={() => onDownload(version.id)}
                  className="cursor-pointer font-ui text-caption font-semibold text-action hover:underline"
                >
                  Baixar
                </button>
                {index !== 0 && canRestore && (
                  <button
                    type="button"
                    disabled={restoreVersion.isPending}
                    onClick={() =>
                      target &&
                      restoreVersion.mutate({
                        unitId,
                        documentId: target.id,
                        versionId: version.id,
                      })
                    }
                    className="cursor-pointer font-ui text-caption font-semibold text-ink-soft hover:underline disabled:opacity-50"
                  >
                    Restaurar
                  </button>
                )}
                {index !== 0 && canPurge && (
                  <button
                    type="button"
                    title="Apagar esta versão do histórico (sem recuperação)"
                    onClick={() => purgeConfirm.open({ id: version.id, number: version.number })}
                    className="cursor-pointer font-ui text-caption font-semibold text-bad hover:underline"
                  >
                    Excluir
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {purgeConfirm.target && (
        <ConfirmDialog
          open={purgeConfirm.isOpen}
          onClose={purgeConfirm.close}
          title="Excluir versão do histórico"
          actionLabel="Excluir versão"
          pendingLabel="Excluindo…"
          pending={removeVersion.isPending}
          error={removeVersion.error?.message}
          onConfirm={() =>
            target &&
            removeVersion.mutate({
              unitId,
              documentId: target.id,
              versionId: purgeConfirm.target!.id,
            })
          }
        >
          O arquivo da versão <strong>v{purgeConfirm.target.number}</strong> de{' '}
          <strong>{target?.name}</strong> é removido do sistema —{' '}
          <strong>sem recuperação</strong>. As demais versões continuam intactas.
        </ConfirmDialog>
      )}
    </Dialog>
  );
}
