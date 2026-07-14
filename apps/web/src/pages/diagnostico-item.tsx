import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, History } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { Button } from '@/components/ui/button';
import { Page, PageTitle } from '@/components/ui/page';
import { RequisitosNcs } from '@/components/diagnostico/requisitos-ncs';

// Configuração de um item de adequação (RF13.1): status do item, orientação
// da unidade e a árvore Requisitos → NCs (components/diagnostico/requisitos-ncs).

export function DiagnosticoItemPage() {
  const { companyId, unitId, adequacyItemId } = useParams({
    from: '/_authed/$companyId/$unitId/diagnosticos/$adequacyItemId',
  });
  const queryClient = useQueryClient();

  // Sem as permissões de escrita, a página vira leitura: salvar/checkbox/
  // orientação seguem "diagnostico.configurar" e os requisitos/NCs,
  // "diagnostico.requisitos".
  const { can } = useUnitPermissions(unitId);
  const canConfigure = can('diagnostico.configurar');
  const canEditRequirements = can('diagnostico.requisitos');

  const item = useQuery(trpc.adequacy.itemDetail.queryOptions({ unitId, adequacyItemId }));

  // — Status + orientação —
  const [isActive, setIsActive] = useState(true);
  const [orientation, setOrientation] = useState('');
  useEffect(() => {
    if (item.data) {
      setIsActive(item.data.isActive);
      setOrientation(item.data.orientation ?? '');
    }
  }, [item.data]);

  const updateItem = useMutation(
    trpc.adequacy.updateItem.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.adequacy.itemDetail.queryKey({ unitId, adequacyItemId }),
        });
        queryClient.invalidateQueries({ queryKey: trpc.adequacy.list.queryKey({ unitId }) });
      },
    }),
  );

  return (
    <Page>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/$companyId/$unitId/diagnosticos"
          params={{ companyId, unitId }}
          className="flex items-center gap-1.5 font-ui text-sm font-medium text-muted hover:text-action"
        >
          <ArrowLeft aria-hidden className="size-4" /> Diagnóstico
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/$companyId/$unitId/diagnosticos/$adequacyItemId/historico"
            params={{ companyId, unitId, adequacyItemId }}
            className="flex items-center gap-1.5 rounded-ctl border border-line-strong bg-surface px-3 py-2 font-ui text-sm font-semibold hover:bg-paper"
          >
            <History aria-hidden className="size-4" /> Histórico
          </Link>
          {canConfigure && (
            <Button
              disabled={updateItem.isPending}
              onClick={() =>
                updateItem.mutate({ unitId, adequacyItemId, isActive, orientation: orientation || null })
              }
            >
              {updateItem.isPending ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          )}
        </div>
      </div>

      <div>
        <p className="text-sm text-muted">Configuração do item</p>
        <PageTitle>
          {item.data?.normCode ?? '…'}
        </PageTitle>
      </div>

      <div className="space-y-2 text-sm">
        <p>{item.data?.normDescription}</p>
        <p className="rounded-card border-l-2 border-hazard bg-paper px-3 py-2 text-ink-soft">
          {item.data?.normOrientation}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-card border border-line p-4">
        <div>
          <p className="font-ui text-sm font-semibold">Item ativo na avaliação</p>
          <p className="text-caption text-muted">
            Desative para tirar a norma do escopo desta unidade.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 font-ui text-sm font-medium">
          <input
            type="checkbox"
            checked={isActive}
            disabled={!canConfigure}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 accent-action"
          />
          {isActive ? 'Ativo' : 'Fora de escopo'}
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="orientacao" className="font-ui text-caption font-semibold">
          Orientação da unidade
        </label>
        <textarea
          id="orientacao"
          rows={3}
          disabled={!canConfigure}
          value={orientation}
          onChange={(e) => setOrientation(e.target.value)}
          placeholder="Instruções específicas de como esta norma se aplica nesta unidade…"
          className="rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-[15px] focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
        />
      </div>

      {/* — Árvore Requisitos → NCs — */}
      <RequisitosNcs
        unitId={unitId}
        adequacyItemId={adequacyItemId}
        canEdit={canEditRequirements}
      />
    </Page>
  );
}
