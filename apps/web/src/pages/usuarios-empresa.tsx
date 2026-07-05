import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
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
import { CompanyUserCreateDialog } from '@/components/usuarios/company-user-create-dialog';

// Painel de usuários DA EMPRESA (admin): só quem tem vínculo em alguma
// unidade dela; criação já nasce vinculada às unidades escolhidas com papel
// da empresa; acessos gerenciados apenas dentro desta empresa.

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function UsuariosEmpresaPage() {
  const { companyId } = useParams({ from: '/_authed/$companyId/usuarios' });
  const { data: session } = useSession();
  const isAdmin = session?.user.role === 'admin';
  const users = useQuery({
    ...trpc.users.listByCompany.queryOptions({ companyId }),
    enabled: isAdmin,
  });
  const [accessTarget, setAccessTarget] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
  const { ord, dir } = useSearch({ from: '/_authed/$companyId/usuarios' });
  const navigate = useNavigate();

  // Ordenação (?ord=&dir=).
  type Row = NonNullable<typeof users.data>[number];
  const currentOrd = ord ?? 'nome';
  const currentDir = dir ?? 'asc';
  const accessors: Record<string, (row: Row) => SortValue> = {
    nome: (row) => normalizeText(row.name),
    email: (row) => normalizeText(row.email),
    papeis: (row) => normalizeText(row.unitRoles.map((entry) => entry.name).join(' ')),
    cadastro: (row) => new Date(row.createdAt).getTime(),
  };
  const sorted = sortRows(users.data ?? [], accessors[currentOrd] ?? accessors.nome!, currentDir);
  const handleSort = (key: string) =>
    navigate({
      to: '/$companyId/usuarios',
      params: { companyId },
      search: toggleSort({ ord, dir }, key, 'nome'),
    });

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
          <p className="text-sm text-muted">Empresa</p>
          <h1 className="text-[28px] font-bold tracking-tight">Usuários da empresa</h1>
          <p className="mt-1 text-sm text-muted">
            Quem tem acesso a unidades desta empresa. Usuários criados aqui já nascem
            vinculados às unidades escolhidas, com um papel da empresa.
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
                  ['papeis', 'Papel nas unidades'],
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
            {users.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3.5 py-12 text-center text-muted">
                  Nenhum usuário com acesso a esta empresa — crie um ou libere acessos no
                  painel global de Usuários.
                </td>
              </tr>
            )}
            {sorted.map((user) => (
              <tr key={user.id} className="hover:bg-paper">
                <td className="w-full border-b border-line px-3.5 py-2.5 font-medium">
                  {user.name}
                </td>
                <td className="border-b border-line px-3.5 py-2.5 text-muted">{user.email}</td>
                <td className="border-b border-line px-3.5 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {user.unitRoles.map((entry) => (
                      <Pill
                        key={entry.name}
                        label={entry.units > 1 ? `${entry.name} ×${entry.units}` : entry.name}
                        className="bg-suf-soft text-suf"
                      />
                    ))}
                  </div>
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
        <AccessDialog
          user={accessTarget}
          companyId={companyId}
          onClose={() => setAccessTarget(null)}
        />
      )}
      <CompanyUserCreateDialog
        companyId={companyId}
        open={creating}
        onClose={() => setCreating(false)}
      />
    </Page>
  );
}
