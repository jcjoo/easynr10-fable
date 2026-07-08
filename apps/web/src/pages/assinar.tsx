import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { CircleCheck, FileText } from 'lucide-react';
import {
  authorizationTypeLabels,
  type EpiSheetDetails,
  type WorkPermitDetails,
} from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SignaturePad } from '@/components/autorizacoes/signature-pad';
import fullLogo from '@/assets/fullLogo.png';
import fullLogoDark from '@/assets/fullLogoDark.png';

// Página PÚBLICA de assinatura (/assinar/<token>): o colaborador pode não ter
// acesso ao sistema — o token opaco do link é a credencial. Assinou, o PDF
// com trilha de auditoria é gerado e arquivado; a página oferece uma cópia.

export function AssinarPage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const info = useQuery({
    ...trpc.authorizations.publicByToken.queryOptions({ token }),
    retry: false,
  });
  const [signature, setSignature] = useState<string | null>(null);
  const sign = useMutation(trpc.authorizations.publicSign.mutationOptions());

  const data = info.data;
  const typeLabel = data ? authorizationTypeLabels[data.type] : '';

  return (
    <div className="flex min-h-screen items-start justify-center bg-paper p-4 py-10">
      <Card className="w-full max-w-xl overflow-hidden">
        <div aria-hidden className="tape h-2.5" />
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <div className="font-mono text-xs uppercase tracking-[.14em] text-muted">
              PSO Engenharia
            </div>
            <img src={fullLogo} alt="EasyNR10" className="mt-2.5 h-9 dark:hidden" />
            <img src={fullLogoDark} alt="EasyNR10" className="mt-2.5 hidden h-9 dark:block" />
          </div>

          {info.isLoading && <p className="text-sm text-muted">Carregando…</p>}

          {info.isError && (
            <div>
              <h1 className="text-lg font-bold">Link inválido</h1>
              <p className="mt-1.5 text-sm text-muted">
                Este link de assinatura não existe ou foi removido. Peça um novo link a quem
                enviou o documento.
              </p>
            </div>
          )}

          {data && (
            <>
              <div>
                <h1 className="text-title font-bold tracking-tight">{typeLabel}</h1>
                <p className="mt-1 text-sm text-muted">
                  {data.companyName} — {data.unitName} · gerada em {formatDate(data.createdAt)}
                </p>
              </div>

              <div className="rounded-card border border-line bg-paper p-4 text-sm">
                <p>
                  <span className="text-muted">Colaborador:</span>{' '}
                  <strong>{data.employeeName}</strong>
                </p>
                {data.type === 'permissao_trabalho' ? (
                  <div className="mt-2 flex flex-col gap-1">
                    <p className="whitespace-pre-wrap">
                      <span className="text-muted">Atividade:</span>{' '}
                      {(data.details as WorkPermitDetails).atividade}
                    </p>
                    {(data.details as WorkPermitDetails).local && (
                      <p>
                        <span className="text-muted">Local:</span>{' '}
                        {(data.details as WorkPermitDetails).local}
                      </p>
                    )}
                    {(data.details as WorkPermitDetails).validade && (
                      <p>
                        <span className="text-muted">Válida até:</span>{' '}
                        {formatDate((data.details as WorkPermitDetails).validade!)}
                      </p>
                    )}
                  </div>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1">
                    {(data.details as EpiSheetDetails).epis.map((epi, index) => (
                      <li key={index} className="flex items-baseline justify-between gap-3">
                        <span>{epi.nome}</span>
                        {epi.ca && (
                          <span className="font-mono text-label text-muted">CA {epi.ca}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {sign.isSuccess ? (
                <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-ok-soft/40 p-6 text-center">
                  <CircleCheck aria-hidden className="size-10 text-ok" />
                  <div>
                    <p className="font-semibold">Documento assinado!</p>
                    <p className="mt-1 text-sm text-muted">
                      O PDF assinado foi arquivado no prontuário. Obrigado, {data.employeeName}.
                    </p>
                  </div>
                  {sign.data.downloadUrl && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => window.open(sign.data.downloadUrl!, '_blank', 'noopener')}
                    >
                      <FileText aria-hidden className="size-4" /> Ver meu documento
                    </Button>
                  )}
                </div>
              ) : data.status === 'assinada' ? (
                <div className="flex items-center gap-3 rounded-card border border-line bg-ok-soft/40 p-4">
                  <CircleCheck aria-hidden className="size-6 shrink-0 text-ok" />
                  <p className="text-sm">
                    Este documento já foi assinado
                    {data.signedAt ? ` em ${formatDate(data.signedAt)}` : ''}. Nada a fazer por
                    aqui.
                  </p>
                </div>
              ) : data.status === 'cancelada' ? (
                <div className="rounded-card border border-line bg-idle-soft p-4">
                  <p className="text-sm">
                    Esta autorização foi <strong>cancelada</strong> — o link não vale mais. Em caso
                    de dúvida, fale com quem enviou o documento.
                  </p>
                </div>
              ) : (
                <>
                  <SignaturePad signerName={data.employeeName} onChange={setSignature} />
                  {sign.error && (
                    <p role="alert" className="text-sm text-bad">
                      {sign.error.message}
                    </p>
                  )}
                  <Button
                    type="button"
                    disabled={!signature || sign.isPending}
                    onClick={() => signature && sign.mutate({ token, signature })}
                    className="justify-center"
                  >
                    {sign.isPending ? 'Gerando documento…' : 'Assinar documento'}
                  </Button>
                  <p className="text-center text-xs text-muted">
                    Ao assinar, você declara estar de acordo com o conteúdo acima; data, hora e
                    meio de assinatura entram na trilha de auditoria do documento.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
