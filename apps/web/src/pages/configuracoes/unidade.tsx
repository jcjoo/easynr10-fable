import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Building2, ChevronRight, MapPinned } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { LogoField } from '@/components/ui/logo-field';
import { Pill } from '@/components/ui/pill';
import { ScopePicker } from '@/components/ui/scope-picker';
import { AccessDialog } from '@/components/usuarios/access-dialog';
import { RolesManager } from '@/components/usuarios/roles-manager';
import { UsersTable, type UserTableRow } from '@/components/usuarios/users-table';
import { AdminOnly, SectionHeader, useCompanyScope, useUnitScope } from './index';
import type { EmpresaTab } from './empresa';

// Configurações → Unidade: usuários, papéis (herdando sistema+empresa, com
// papéis próprios) e informações da unidade — empresa/unidade em pickers
// horizontais (breadcrumb), pré-selecionadas pelo contexto ativo. As
// subseções são filhos na sidebar das Configurações (?aba na URL).

const tabTitles: Record<EmpresaTab, { title: string; description: string }> = {
  usuarios: {
    title: 'Usuários da unidade',
    description: 'Quem tem vínculo nesta unidade e com qual papel.',
  },
  papeis: {
    title: 'Papéis da unidade',
    description: 'Herda os do sistema e da empresa; papéis próprios valem só aqui.',
  },
  info: { title: 'Informações da unidade', description: 'Nome e logo da unidade.' },
};

export function UnidadePage() {
  const navigate = useNavigate();
  const { empresa, unidade, aba } = useSearch({ from: '/_settings/configuracoes/unidade' });
  const { companyId, companies, empty } = useCompanyScope(empresa);
  const { unitId, units, empty: noUnits } = useUnitScope(companyId, unidade);
  const tab: EmpresaTab = aba ?? 'usuarios';

  const go = (next: { empresa?: string; unidade?: string }) =>
    navigate({
      to: '/configuracoes/unidade',
      search: {
        empresa: next.empresa ?? companyId,
        // Trocar de empresa zera a unidade (a anterior é de outra empresa).
        unidade: next.empresa && next.empresa !== companyId ? undefined : (next.unidade ?? unitId),
        aba: tab,
      },
    });

  return (
    <AdminOnly>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader title={tabTitles[tab].title} description={tabTitles[tab].description} />
          {/* Escopo como breadcrumb: Empresa › Unidade */}
          <div className="flex flex-wrap items-center gap-1.5">
            <ScopePicker
              label="Empresa"
              icon={Building2}
              value={companyId}
              options={companies}
              onChange={(id) => id && go({ empresa: id })}
            />
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
            <ScopePicker
              label="Unidade"
              icon={MapPinned}
              value={unitId}
              options={units}
              onChange={(id) => id && go({ unidade: id })}
            />
          </div>
        </div>
        {empty ? (
          <p className="rounded-card border border-dashed border-line-strong px-4 py-12 text-center text-sm text-muted">
            Nenhuma empresa cadastrada ainda — crie uma em Empresas.
          </p>
        ) : (
          <>
            {noUnits && (
              <p className="rounded-card border border-dashed border-line-strong px-4 py-12 text-center text-sm text-muted">
                Esta empresa ainda não tem unidades.
              </p>
            )}
            {companyId && unitId && tab === 'usuarios' && (
              <UnitUsers key={unitId} companyId={companyId} unitId={unitId} />
            )}
            {companyId && unitId && tab === 'papeis' && (
              <RolesManager key={unitId} companyId={companyId} unitId={unitId} />
            )}
            {unitId && tab === 'info' && <UnitInfo key={unitId} unitId={unitId} />}
          </>
        )}
      </div>
    </AdminOnly>
  );
}

function UnitUsers({ companyId, unitId }: { companyId: string; unitId: string }) {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === 'admin';
  const users = useQuery({
    ...trpc.users.listByUnit.queryOptions({ unitId }),
    enabled: isAdmin,
  });
  const [accessTarget, setAccessTarget] = useState<UserTableRow | null>(null);

  const rows: UserTableRow[] = (users.data ?? []).map((row) => ({
    ...row,
    rolesNode: <Pill label={row.roleName} className="bg-suf-soft text-suf" />,
    rolesSort: row.roleName,
  }));

  return (
    <>
      <UsersTable
        rows={rows}
        rolesHeader="Papel na unidade"
        emptyMessage="Nenhum usuário com vínculo nesta unidade — libere acessos na Administração ou na Empresa."
        onManage={setAccessTarget}
      />
      {accessTarget && (
        <AccessDialog
          user={accessTarget}
          companyId={companyId}
          onClose={() => setAccessTarget(null)}
        />
      )}
    </>
  );
}

function UnitInfo({ unitId }: { unitId: string }) {
  const queryClient = useQueryClient();
  const unit = useQuery(trpc.units.byId.queryOptions({ unitId }));
  const logo = useQuery(trpc.units.logoUrl.queryOptions({ unitId }));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: trpc.units.byId.queryKey({ unitId }) });
    queryClient.invalidateQueries({ queryKey: trpc.units.logoUrl.queryKey({ unitId }) });
  };
  const update = useMutation(trpc.units.update.mutationOptions({ onSuccess: invalidate }));
  const logoUploadUrl = useMutation(trpc.units.logoUploadUrl.mutationOptions());

  const [name, setName] = useState<string | null>(null);
  const nameValue = name ?? unit.data?.name ?? '';
  const saveName = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({ id: unitId, name: nameValue.trim() });
  };

  const [uploading, setUploading] = useState(false);
  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const { uploadUrl, storageKey } = await logoUploadUrl.mutateAsync({
        unitId,
        mimeType: file.type as 'image/png',
      });
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload falhou (${put.status})`);
      await update.mutateAsync({ id: unitId, logoKey: storageKey });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-card border border-line p-4">
        <LogoField
          url={logo.data}
          busy={uploading}
          onSelect={uploadLogo}
          onRemove={() => update.mutate({ id: unitId, logoKey: null })}
        />
      </div>
      <form onSubmit={saveName} className="flex flex-col gap-3 rounded-card border border-line p-4">
        <Field
          label="Nome da unidade"
          value={nameValue}
          onChange={(e) => setName(e.target.value)}
        />
        {update.error && (
          <p role="alert" className="text-sm text-bad">
            {update.error.message}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={nameValue.trim().length < 2 || update.isPending}>
            {update.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </div>
  );
}
