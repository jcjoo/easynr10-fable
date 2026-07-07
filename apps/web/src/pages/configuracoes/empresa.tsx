import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Building2, UserPlus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { LogoField } from '@/components/ui/logo-field';
import { ScopePicker } from '@/components/ui/scope-picker';
import { AccessDialog } from '@/components/usuarios/access-dialog';
import { CompanyUserCreateDialog } from '@/components/usuarios/company-user-create-dialog';
import { RolesManager } from '@/components/usuarios/roles-manager';
import { RolesPills, UsersTable, type UserTableRow } from '@/components/usuarios/users-table';
import { AdminOnly, SectionHeader, useCompanyScope } from './index';

// Configurações → Empresa: usuários, papéis e informações (nome, logo) da
// empresa selecionada — pré-seleciona a ATIVA, trocável no picker. As
// subseções são filhos na sidebar das Configurações (?aba na URL).

export const empresaTabs = ['usuarios', 'papeis', 'info'] as const;
export type EmpresaTab = (typeof empresaTabs)[number];

const tabTitles: Record<EmpresaTab, { title: string; description: string }> = {
  usuarios: {
    title: 'Usuários da empresa',
    description: 'Quem tem acesso a unidades desta empresa.',
  },
  papeis: {
    title: 'Papéis da empresa',
    description: 'Padrões do sistema + papéis customizados, válidos em todas as unidades.',
  },
  info: { title: 'Informações da empresa', description: 'Nome e logo da empresa.' },
};

export function EmpresaPage() {
  const navigate = useNavigate();
  const { empresa, aba } = useSearch({ from: '/_settings/configuracoes/empresa' });
  const { companyId, companies, empty } = useCompanyScope(empresa);
  const tab: EmpresaTab = aba ?? 'usuarios';

  return (
    <AdminOnly>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader title={tabTitles[tab].title} description={tabTitles[tab].description} />
          <ScopePicker
            label="Empresa"
            icon={Building2}
            value={companyId}
            options={companies}
            onChange={(id) =>
              id && navigate({ to: '/configuracoes/empresa', search: { empresa: id, aba: tab } })
            }
          />
        </div>
        {empty ? (
          <p className="rounded-card border border-dashed border-line-strong px-4 py-12 text-center text-sm text-muted">
            Nenhuma empresa cadastrada ainda — crie uma em Empresas.
          </p>
        ) : (
          <>
            {companyId && tab === 'usuarios' && (
              <CompanyUsers key={companyId} companyId={companyId} />
            )}
            {companyId && tab === 'papeis' && <RolesManager key={companyId} companyId={companyId} />}
            {companyId && tab === 'info' && <CompanyInfo key={companyId} companyId={companyId} />}
          </>
        )}
      </div>
    </AdminOnly>
  );
}

function CompanyUsers({ companyId }: { companyId: string }) {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === 'admin';
  const users = useQuery({
    ...trpc.users.listByCompany.queryOptions({ companyId }),
    enabled: isAdmin,
  });
  const [accessTarget, setAccessTarget] = useState<UserTableRow | null>(null);
  const [creating, setCreating] = useState(false);

  const rows: UserTableRow[] = (users.data ?? []).map((row) => ({
    ...row,
    rolesNode: <RolesPills unitRoles={row.unitRoles} />,
    rolesSort: row.unitRoles.map((entry) => entry.name).join(' '),
  }));

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <UserPlus aria-hidden className="size-4" /> Novo usuário
        </Button>
      </div>
      <UsersTable
        rows={rows}
        rolesHeader="Papel nas unidades"
        emptyMessage="Nenhum usuário com acesso a esta empresa — crie um ou libere acessos na Administração."
        onManage={setAccessTarget}
      />
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
    </>
  );
}

function CompanyInfo({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const company = useQuery(trpc.companies.byId.queryOptions({ id: companyId }));
  const logo = useQuery(trpc.companies.logoUrl.queryOptions({ companyId }));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: trpc.companies.byId.queryKey({ id: companyId }) });
    queryClient.invalidateQueries({ queryKey: trpc.companies.list.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.companies.logoUrl.queryKey({ companyId }) });
  };
  const update = useMutation(trpc.companies.update.mutationOptions({ onSuccess: invalidate }));
  const logoUploadUrl = useMutation(trpc.companies.logoUploadUrl.mutationOptions());

  const [name, setName] = useState<string | null>(null);
  const nameValue = name ?? company.data?.name ?? '';
  const saveName = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({ id: companyId, name: nameValue.trim() });
  };

  const [uploading, setUploading] = useState(false);
  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const { uploadUrl, storageKey } = await logoUploadUrl.mutateAsync({
        companyId,
        mimeType: file.type as 'image/png',
      });
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload falhou (${put.status})`);
      await update.mutateAsync({ id: companyId, logoKey: storageKey });
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
          onRemove={() => update.mutate({ id: companyId, logoKey: null })}
        />
      </div>
      <form onSubmit={saveName} className="flex flex-col gap-3 rounded-card border border-line p-4">
        <Field
          label="Nome da empresa"
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
