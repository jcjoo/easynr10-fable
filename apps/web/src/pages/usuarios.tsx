import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { UserPlus } from 'lucide-react';
import { normalizeText } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Page } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';
import {
  PlainTh,
  SortableTh,
  sortRows,
  toggleSort,
  type SortValue,
} from '@/components/ui/sortable';
import { AccessDialog } from '@/components/usuarios/access-dialog';
import { CreateUserDialog } from '@/components/usuarios/create-user-dialog';

// Painel de usuários (admin): criar usuários, gerenciar papéis (mapeamento
// de permissões) e liberar/revogar acesso a empresas e unidades.

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function UsuariosPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === 'admin';
  const users = useQuery({ ...trpc.users.list.queryOptions(), enabled: isAdmin });
  const [accessTarget, setAccessTarget] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
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
    papelUnidade: (row) =>
      row.role === 'admin'
        ? ''
        : normalizeText(row.unitRoles.map((entry) => entry.name).join(' ') || 'zzz'),
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted">
            Crie usuários e libere o acesso às empresas e unidades — os papéis de cada
            empresa ficam na seção da empresa, em "Papéis".
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <UserPlus aria-hidden className="size-4" /> Novo usuário
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {(
                [
                  ['nome', 'Nome'],
                  ['email', 'E-mail'],
                  ['papel', 'Papel global'],
                  ['papelUnidade', 'Papel nas unidades'],
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
                  <Pill
                    label={user.role === 'admin' ? 'Admin' : 'Usuário'}
                    className={
                      user.role === 'admin' ? 'bg-action-soft text-action' : 'bg-idle-soft text-idle'
                    }
                  />
                </td>
                <td className="border-b border-line px-3.5 py-2.5">
                  {user.role === 'admin' ? (
                    <span className="text-[13px] text-muted">Acesso total</span>
                  ) : user.unitRoles.length === 0 ? (
                    <span className="text-[13px] text-muted">Sem acessos</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {user.unitRoles.map((entry) => (
                        <Pill
                          key={entry.name}
                          label={
                            entry.units > 1 ? `${entry.name} ×${entry.units}` : entry.name
                          }
                          className="bg-suf-soft text-suf"
                        />
                      ))}
                    </div>
                  )}
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
      <CreateUserDialog open={creating} onClose={() => setCreating(false)} />
    </Page>
  );
}
