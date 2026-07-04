import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { normalizeText } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Page } from '@/components/ui/page';
import {
  PlainTh,
  SortableTh,
  sortRows,
  toggleSort,
  type SortValue,
} from '@/components/ui/sortable';

// Painel de usuários (admin): liberar/revogar acesso a empresas e unidades.
// O vínculo do modelo é por unidade (membership); marcar a empresa marca
// todas as unidades dela.

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('pt-BR');
}

function AccessDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const tree = useQuery(trpc.users.accessTree.queryOptions());
  const memberships = useQuery(trpc.users.memberships.queryOptions({ userId: user.id }));

  const granted = new Set(memberships.data?.map((row) => row.unitId));
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.users.memberships.queryKey({ userId: user.id }),
    });
  const grant = useMutation(trpc.users.grant.mutationOptions({ onSuccess: invalidate }));
  const revoke = useMutation(trpc.users.revoke.mutationOptions({ onSuccess: invalidate }));
  const pending = grant.isPending || revoke.isPending || memberships.isLoading;

  const toggleUnits = (unitIds: string[], allow: boolean) => {
    if (unitIds.length === 0) return;
    const input = { userId: user.id, unitIds };
    if (allow) grant.mutate(input);
    else revoke.mutate(input);
  };

  return (
    <Dialog open onClose={onClose} title={`Acessos de ${user.name}`}>
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
        {user.role === 'admin' ? (
          <p className="text-sm text-muted">
            Este usuário é <strong>admin</strong> e já tem acesso a todas as empresas e
            unidades — não é preciso liberar nada.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Marque as unidades que <strong>{user.name}</strong> pode acessar. Marcar a
              empresa libera todas as unidades dela.
            </p>

            {tree.data?.length === 0 && (
              <p className="text-sm text-muted">Nenhuma empresa cadastrada.</p>
            )}

            {tree.data?.map((company) => {
              const unitIds = company.units.map((unit) => unit.id);
              const grantedCount = unitIds.filter((id) => granted.has(id)).length;
              const allGranted = unitIds.length > 0 && grantedCount === unitIds.length;
              return (
                <div key={company.id} className="rounded-card border border-line p-3">
                  <label className="flex cursor-pointer items-center gap-2 font-ui text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={allGranted}
                      ref={(el) => {
                        if (el) el.indeterminate = grantedCount > 0 && !allGranted;
                      }}
                      disabled={pending || unitIds.length === 0}
                      onChange={() => toggleUnits(unitIds, !allGranted)}
                      className="size-4 accent-[var(--color-action)]"
                    />
                    {company.name}
                    <span className="font-normal text-muted">
                      {unitIds.length === 0
                        ? '(sem unidades)'
                        : `${grantedCount}/${unitIds.length} unidade(s)`}
                    </span>
                  </label>
                  {company.units.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1.5 pl-6">
                      {company.units.map((unit) => (
                        <label
                          key={unit.id}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={granted.has(unit.id)}
                            disabled={pending}
                            onChange={() => toggleUnits([unit.id], !granted.has(unit.id))}
                            className="size-4 accent-[var(--color-action)]"
                          />
                          {unit.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {(grant.error || revoke.error) && (
              <p role="alert" className="text-sm text-bad">
                {grant.error?.message ?? revoke.error?.message}
              </p>
            )}
          </>
        )}

        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function UsuariosPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === 'admin';
  const users = useQuery({ ...trpc.users.list.queryOptions(), enabled: isAdmin });
  const [accessTarget, setAccessTarget] = useState<UserRow | null>(null);
  const { ord, dir } = useSearch({ from: '/_authed/usuarios' });
  const navigate = useNavigate();

  // Ordenação (?ord=&dir=).
  type Row = NonNullable<typeof users.data>[number];
  const currentOrd = ord ?? 'nome';
  const currentDir = dir ?? 'asc';
  const accessors: Record<string, (row: Row) => SortValue> = {
    nome: (row) => normalizeText(row.name),
    email: (row) => normalizeText(row.email),
    papel: (row) => (row.role === 'admin' ? 0 : 1),
    cadastro: (row) => new Date(row.createdAt).getTime(),
  };
  const sorted = sortRows(users.data ?? [], accessors[currentOrd] ?? accessors.nome!, currentDir);
  const handleSort = (key: string) =>
    navigate({ to: '/usuarios', search: toggleSort({ ord, dir }, key, 'nome') });

  if (session && !isAdmin) {
    return (
      <Page>
        <h1 className="text-[28px] font-bold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted">Somente consultores PSO têm acesso a esta área.</p>
      </Page>
    );
  }

  return (
    <Page>
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted">
          Libere o acesso dos usuários às empresas e unidades.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {(
                [
                  ['nome', 'Nome'],
                  ['email', 'E-mail'],
                  ['papel', 'Papel'],
                  ['cadastro', 'Cadastro'],
                ] as const
              ).map(([key, label]) => (
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
            {sorted.map((user) => (
              <tr key={user.id} className="hover:bg-paper">
                <td className="w-full border-b border-line px-3.5 py-2.5 font-medium">
                  {user.name}
                </td>
                <td className="border-b border-line px-3.5 py-2.5 text-muted">{user.email}</td>
                <td className="border-b border-line px-3.5 py-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 font-ui text-[12.5px] font-semibold ${
                      user.role === 'admin' ? 'bg-action-soft text-action' : 'bg-idle-soft text-idle'
                    }`}
                  >
                    {user.role === 'admin' ? 'Admin' : 'Cliente'}
                  </span>
                </td>
                <td className="tabular border-b border-line px-3.5 py-2.5 font-mono text-[13px]">
                  {formatDate(user.createdAt)}
                </td>
                <td className="border-b border-line px-3.5 py-2.5">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setAccessTarget(user)}
                    >
                      Gerenciar acessos
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {accessTarget && (
        <AccessDialog user={accessTarget} onClose={() => setAccessTarget(null)} />
      )}
    </Page>
  );
}
