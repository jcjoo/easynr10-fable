import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { RowMenu } from '@/components/ui/row-menu';
import { Page, PageTitle } from '@/components/ui/page';

export function UnitsPage() {
  const { companyId } = useParams({ from: '/_authed/$companyId/unidades' });
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const company = useQuery(trpc.companies.byId.queryOptions({ id: companyId }));
  const units = useQuery(trpc.units.listByCompany.queryOptions({ companyId }));
  const [name, setName] = useState('');

  const createUnit = useMutation(
    trpc.units.create.mutationOptions({
      onSuccess: () => {
        setName('');
        queryClient.invalidateQueries({
          queryKey: trpc.units.listByCompany.queryKey({ companyId }),
        });
      },
    }),
  );

  const isAdmin = session?.user.role === 'admin';

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const removeUnit = useMutation(
    trpc.units.remove.mutationOptions({
      onSuccess: () => {
        setDeleteTarget(null);
        queryClient.invalidateQueries({
          queryKey: trpc.units.listByCompany.queryKey({ companyId }),
        });
      },
    }),
  );

  return (
    <Page>
      <div>
        <p className="text-sm text-muted">{company.data?.name ?? '…'}</p>
        <PageTitle>Unidades</PageTitle>
      </div>

      {isAdmin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2)
              createUnit.mutate({ companyId, name: name.trim() });
          }}
          className="flex gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da nova unidade"
            aria-label="Nome da nova unidade"
            className="flex-1 rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-[15px] focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
          />
          <Button type="submit" disabled={createUnit.isPending}>
            {createUnit.isPending ? 'Criando…' : 'Criar unidade'}
          </Button>
        </form>
      )}

      {units.isLoading && <p className="text-sm text-muted">Carregando…</p>}

      {units.data?.length === 0 && (
        <div className="rounded-card border border-dashed border-line-strong p-10 text-center">
          <div className="font-ui text-base font-semibold">Nenhuma unidade nesta empresa</div>
          <p className="mx-auto mt-1 max-w-[44ch] text-sm text-muted">
            {isAdmin
              ? 'Crie a primeira unidade para montar o P.I.E e iniciar a avaliação de conformidade.'
              : 'Você ainda não tem acesso a nenhuma unidade desta empresa.'}
          </p>
        </div>
      )}

      <ul className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {units.data?.map((unit) => (
          <li key={unit.id} className="relative">
            <Link
              to="/$companyId/$unitId"
              params={{ companyId, unitId: unit.id }}
              className="block rounded-card bg-paper p-4 transition-colors hover:bg-line/60"
            >
              <span className="font-ui font-semibold">{unit.name}</span>
              <div className="mt-0.5 text-caption text-muted">Abrir painel da unidade →</div>
            </Link>
            {isAdmin && (
              <div className="absolute right-2 top-2">
                <RowMenu
                  label={`Ações da unidade ${unit.name}`}
                  items={[
                    {
                      label: 'Excluir',
                      danger: true,
                      onSelect: () => setDeleteTarget(unit),
                    },
                  ]}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Excluir unidade"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Excluir <strong>{deleteTarget?.name}</strong>? O prontuário, diagnósticos e plano de
            ação dela deixarão de aparecer no sistema.
          </p>
          {removeUnit.error && (
            <p role="alert" className="text-sm text-bad">
              {removeUnit.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={removeUnit.isPending}
              onClick={() => deleteTarget && removeUnit.mutate({ id: deleteTarget.id })}
            >
              Excluir
            </Button>
          </div>
        </div>
      </Dialog>
    </Page>
  );
}
