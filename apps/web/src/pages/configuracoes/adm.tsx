import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Building2, ChevronRight, MapPinned, UserPlus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { ScopePicker } from '@/components/ui/scope-picker';
import { AccessDialog } from '@/components/usuarios/access-dialog';
import { CreateUserDialog } from '@/components/usuarios/create-user-dialog';
import { RolesPills, UsersTable, type UserTableRow } from '@/components/usuarios/users-table';
import { AdminOnly, SectionHeader } from './index';

// Configurações → Administração: TODOS os usuários do sistema, com agregação
// opcional por empresa e unidade (?empresa=&unidade= — "Todas" = visão global).

export function AdmPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === 'admin';
  const navigate = useNavigate();
  const { empresa, unidade } = useSearch({ from: '/_settings/configuracoes/adm' });

  const companies = useQuery({ ...trpc.companies.list.queryOptions(), enabled: isAdmin });
  const units = useQuery({
    ...trpc.units.listByCompany.queryOptions({ companyId: empresa ?? '' }),
    enabled: isAdmin && Boolean(empresa),
  });
  // Escopo mais específico vence: unidade > empresa > global.
  const scopedUnit = unidade && units.data?.some((row) => row.id === unidade) ? unidade : undefined;

  const globalUsers = useQuery({
    ...trpc.users.list.queryOptions(),
    enabled: isAdmin && !empresa,
  });
  const companyUsers = useQuery({
    ...trpc.users.listByCompany.queryOptions({ companyId: empresa ?? '' }),
    enabled: isAdmin && Boolean(empresa) && !scopedUnit,
  });
  const unitUsers = useQuery({
    ...trpc.users.listByUnit.queryOptions({ unitId: scopedUnit ?? '' }),
    enabled: isAdmin && Boolean(scopedUnit),
  });

  const rows: UserTableRow[] = scopedUnit
    ? (unitUsers.data ?? []).map((row) => ({
        ...row,
        rolesNode: <Pill label={row.roleName} className="bg-suf-soft text-suf" />,
        rolesSort: row.roleName,
      }))
    : empresa
      ? (companyUsers.data ?? []).map((row) => ({
          ...row,
          rolesNode: <RolesPills unitRoles={row.unitRoles} />,
          rolesSort: row.unitRoles.map((entry) => entry.name).join(' '),
        }))
      : (globalUsers.data ?? []).map((row) => ({
          ...row,
          rolesNode:
            row.role === 'admin' ? (
              <span className="text-caption text-muted">Acesso total</span>
            ) : (
              <RolesPills unitRoles={row.unitRoles} />
            ),
          rolesSort: row.unitRoles.map((entry) => entry.name).join(' '),
        }));

  const [accessTarget, setAccessTarget] = useState<UserTableRow | null>(null);
  const [creating, setCreating] = useState(false);

  const setScope = (nextEmpresa?: string, nextUnidade?: string) =>
    navigate({
      to: '/configuracoes/adm',
      search: { empresa: nextEmpresa, unidade: nextUnidade },
    });

  return (
    <AdminOnly>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeader
            title="Administração de usuários"
            description="Todos os usuários do sistema — agregue por empresa/unidade para focar o recorte."
          />
          <Button onClick={() => setCreating(true)}>
            <UserPlus aria-hidden className="size-4" /> Novo usuário
          </Button>
        </div>

        {/* Agregação como breadcrumb de escopo: Empresa › Unidade */}
        <div className="flex flex-wrap items-center gap-1.5">
          <ScopePicker
            label="Empresa"
            icon={Building2}
            value={empresa}
            options={companies.data}
            allLabel="Todas as empresas"
            onChange={(id) => setScope(id, undefined)}
          />
          {empresa && (
            <>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
              <ScopePicker
                label="Unidade"
                icon={MapPinned}
                value={scopedUnit}
                options={units.data}
                allLabel="Todas as unidades"
                onChange={(id) => setScope(empresa, id)}
              />
            </>
          )}
        </div>

        <UsersTable
          rows={rows}
          rolesHeader={scopedUnit ? 'Papel na unidade' : 'Papel nas unidades'}
          showGlobalRole={!empresa}
          emptyMessage="Nenhum usuário neste recorte."
          onManage={setAccessTarget}
        />

        {accessTarget && (
          <AccessDialog
            user={accessTarget}
            companyId={empresa}
            onClose={() => setAccessTarget(null)}
          />
        )}
        <CreateUserDialog open={creating} onClose={() => setCreating(false)} />
      </div>
    </AdminOnly>
  );
}
