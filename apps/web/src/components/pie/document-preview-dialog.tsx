import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Preview de documento (RF09): PDF/texto em iframe (viewer do navegador),
// imagem em <img>; tipos sem preview caem no Baixar.

export interface DocumentPreview {
  documentId: string;
  name: string;
  // url/mimeType nulos = documento sem arquivo enviado (só referência).
  url: string | null;
  mimeType: string | null;
}

export function DocumentPreviewDialog({
  preview,
  onClose,
  onDownload,
}: {
  preview: DocumentPreview | null;
  onClose: () => void;
  onDownload: (documentId: string) => void;
}) {
  return (
    <Dialog
      open={Boolean(preview)}
      onClose={onClose}
      title="Visualizar documento"
      description={preview?.name}
      size="xl"
      footer={
        preview ? (
          <>
            <Button type="button" variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            {preview.url && (
              <Button type="button" onClick={() => onDownload(preview.documentId)}>
                Baixar
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      {preview && (
        <div className="flex flex-col gap-3">
          {!preview.url || !preview.mimeType ? (
            <p className="py-10 text-center text-sm text-muted">
              Este documento é só uma referência — nenhum arquivo foi enviado ainda. Envie um
              arquivo no P.I.E para poder visualizá-lo.
            </p>
          ) : preview.mimeType === 'application/pdf' || preview.mimeType.startsWith('text/') ? (
            <iframe
              src={preview.url}
              title={preview.name}
              className="h-[72vh] w-full rounded-card border border-line bg-paper"
            />
          ) : preview.mimeType.startsWith('image/') ? (
            <div className="flex max-h-[72vh] items-center justify-center overflow-auto rounded-card border border-line bg-paper p-3">
              <img
                src={preview.url}
                alt={preview.name}
                className="max-h-[68vh] max-w-full object-contain"
              />
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted">
              Pré-visualização indisponível para este tipo de arquivo ({preview.mimeType}) —
              baixe para abrir no aplicativo adequado.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
