import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { RowMenu } from '@/components/ui/row-menu';
import { Page } from '@/components/ui/page';

export function CompaniesPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const companies = useQuery(trpc.companies.list.queryOptions());
  const [name, setName] = useState('');

  const createCompany = useMutation(
    trpc.companies.create.mutationOptions({
      onSuccess: () => {
        setName('');
        queryClient.invalidateQueries({ queryKey: trpc.companies.list.queryKey() });
      },
    }),
  );

  const isAdmin = session?.user.role === 'admin';

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const removeCompany = useMutation(
    trpc.companies.remove.mutationOptions({
      onSuccess: () => {
        setDeleteTarget(null);
        queryClient.invalidateQueries({ queryKey: trpc.companies.list.queryKey() });
      },
    }),
  );

  return (
    <Page>
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Empresas</h1>
        <p className="text-sm text-muted">Clientes atendidos e suas unidades.</p>
      </div>

      {isAdmin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) createCompany.mutate({ name: name.trim() });
          }}
          className="flex gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da nova empresa"
            aria-label="Nome da nova empresa"
            className="flex-1 rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-[15px] focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
          />
          <Button type="submit" disabled={createCompany.isPending}>
            {createCompany.isPending ? 'Criando…' : 'Criar empresa'}
          </Button>
        </form>
      )}

      {companies.isLoading && <p className="text-sm text-muted">Carregando…</p>}

      {companies.data?.length === 0 && (
        <div className="rounded-card border border-dashed border-line-strong p-10 text-center">
          <div className="font-ui text-base font-semibold">Nenhuma empresa cadastrada</div>
          <p className="mx-auto mt-1 max-w-[44ch] text-sm text-muted">
            {isAdmin
              ? 'Crie a primeira empresa para começar a estruturar unidades e prontuários.'
              : 'Você ainda não tem acesso a nenhuma unidade — fale com o consultor responsável.'}
          </p>
        </div>
      )}

      <ul className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {companies.data?.map((company) => (
          <li key={company.id} className="relative">
            <Link
              to="/$companyId/unidades"
              params={{ companyId: company.id }}
              className="block rounded-card bg-paper p-4 transition-colors hover:bg-line/60"
            >
              <span className="font-ui font-semibold">{company.name}</span>
              <div className="mt-0.5 text-[13px] text-muted">
                {company.unitCount === 0
                  ? 'Sem unidades'
                  : `${company.unitCount} unidade${company.unitCount > 1 ? 's' : ''} →`}
              </div>
            </Link>
            {isAdmin && (
              <div className="absolute right-2 top-2">
                <RowMenu
                  label={`Ações da empresa ${company.name}`}
                  items={[
                    {
                      label: 'Excluir',
                      danger: true,
                      onSelect: () => setDeleteTarget(company),
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
        title="Excluir empresa"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Excluir <strong>{deleteTarget?.name}</strong>? As unidades e os prontuários dela
            deixarão de aparecer no sistema.
          </p>
          {removeCompany.error && (
            <p role="alert" className="text-sm text-bad">
              {removeCompany.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={removeCompany.isPending}
              onClick={() => deleteTarget && removeCompany.mutate({ id: deleteTarget.id })}
            >
              Excluir
            </Button>
          </div>
        </div>
      </Dialog>
    </Page>
  );
}
