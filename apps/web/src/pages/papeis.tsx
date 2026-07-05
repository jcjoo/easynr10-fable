import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Check, Copy, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { unitActionCatalog, unitActionGroups, type UnitAction } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Page } from '@/components/ui/page';
import { Pill } from '@/components/ui/pill';

// Papéis da EMPRESA (RF03.1): padrões do sistema (Gestor/Leitor — imutáveis,
// presentes em toda empresa) + papéis customizados da empresa. O mapeamento é
// 1:1 com o servidor: cada ação lista os endpoints reais que destrava
// (users.permissionCatalog, derivado dos metadados do router).

type RoleRow = {
  id: string;
  name: string;
  isSystem: boolean;
  companyId: string | null;
  permissions: string[];
  inUse: number;
};

export function PapeisPage() {
  const { companyId } = useParams({ from: '/_authed/$companyId/papeis' });
  const { data: session } = useSession();
  const isAdmin = session?.user.role === 'admin';
  const queryClient = useQueryClient();

  const roles = useQuery({
    ...trpc.users.roles.queryOptions({ companyId }),
    enabled: isAdmin,
  });
  const catalog = useQuery({
    ...trpc.users.permissionCatalog.queryOptions(),
    enabled: isAdmin,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected: RoleRow | null =
    roles.data?.find((role) => role.id === selectedId) ?? roles.data?.[0] ?? null;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.users.roles.queryKey({ companyId }) });
  const createRole = useMutation(
    trpc.users.createRole.mutationOptions({
      onSuccess: (created) => {
        invalidate();
        if (created) setSelectedId(created.id);
        setCreating(false);
        setNewName('');
      },
    }),
  );
  const updateRole = useMutation(trpc.users.updateRole.mutationOptions({ onSuccess: invalidate }));
  const removeRole = useMutation(
    trpc.users.removeRole.mutationOptions({
      onSuccess: () => {
        setSelectedId(null);
        invalidate();
      },
    }),
  );

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const togglePermission = (role: RoleRow, action: UnitAction) => {
    const next = new Set(role.permissions as UnitAction[]);
    if (next.has(action)) next.delete(action);
    else next.add(action);
    updateRole.mutate({ roleId: role.id, permissions: [...next] });
  };

  // Marcar/desmarcar um grupo inteiro (ex.: todo o PIE) de uma vez.
  const toggleGroup = (role: RoleRow, group: string, enable: boolean) => {
    const groupActions = unitActionCatalog
      .filter((entry) => entry.group === group)
      .map((entry) => entry.action);
    const next = new Set(role.permissions as UnitAction[]);
    for (const action of groupActions) {
      if (enable) next.add(action);
      else next.delete(action);
    }
    updateRole.mutate({ roleId: role.id, permissions: [...next] });
  };

  const duplicate = (role: RoleRow) =>
    createRole.mutate({
      companyId,
      name: `${role.name} (cópia)`,
      permissions: role.permissions as UnitAction[],
    });

  const error = createRole.error ?? updateRole.error ?? removeRole.error;

  if (session && !isAdmin) {
    return (
      <Page>
        <h1 className="text-[28px] font-bold tracking-tight">Papéis</h1>
        <p className="text-sm text-muted">Somente consultores PSO têm acesso a esta área.</p>
      </Page>
    );
  }

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Empresa</p>
          <h1 className="text-[28px] font-bold tracking-tight">Papéis e permissões</h1>
          <p className="mt-1 text-sm text-muted">
            O papel define o que um membro pode <strong>alterar</strong> nas unidades desta
            empresa — a leitura é liberada a qualquer membro. Padrões do sistema valem para
            todas as empresas; duplique um para customizar.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden className="size-4" /> Novo papel
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-bad">
          {error.message}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Lista de papéis */}
        <div className="flex flex-col gap-1.5">
          {roles.data?.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => {
                setSelectedId(role.id);
                setRenaming(false);
              }}
              className={`flex cursor-pointer items-center gap-2 rounded-card border px-3 py-2.5 text-left ${
                selected?.id === role.id
                  ? 'border-action bg-action-soft/40'
                  : 'border-line hover:border-ink-soft'
              }`}
            >
              <ShieldCheck
                aria-hidden
                className={`size-4 shrink-0 ${selected?.id === role.id ? 'text-action' : 'text-muted'}`}
              />
              <span className="flex-1 truncate font-ui text-sm font-semibold">{role.name}</span>
              {role.isSystem ? (
                <Pill label="Padrão" className="bg-idle-soft text-idle" />
              ) : (
                <span className="font-mono text-[11px] text-muted">
                  {role.permissions.length}/{unitActionCatalog.length}
                </span>
              )}
            </button>
          ))}

          {creating && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newName.trim())
                  createRole.mutate({ companyId, name: newName.trim(), permissions: [] });
              }}
              className="flex flex-col gap-2 rounded-card border border-dashed border-line-strong p-3"
            >
              <Field
                label="Nome do papel"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Técnico de segurança"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={!newName.trim() || createRole.isPending}>
                  Criar
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Detalhe do papel selecionado */}
        {selected && (
          <div className="rounded-card border border-line p-4">
            <div className="flex flex-wrap items-center gap-2">
              {renaming ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (renameValue.trim()) {
                      updateRole.mutate({ roleId: selected.id, name: renameValue.trim() });
                      setRenaming(false);
                    }
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    aria-label="Novo nome do papel"
                    className="rounded-ctl border border-line-strong bg-surface px-2.5 py-1 font-ui text-base font-bold"
                  />
                  <Button type="submit" disabled={!renameValue.trim()}>
                    <Check aria-hidden className="size-4" />
                  </Button>
                </form>
              ) : (
                <h2 className="font-ui text-lg font-bold tracking-tight">{selected.name}</h2>
              )}
              {selected.isSystem && <Pill label="Padrão do sistema" className="bg-idle-soft text-idle" />}
              <span className="text-[13px] text-muted">
                {selected.inUse > 0
                  ? `em uso por ${selected.inUse} acesso(s)`
                  : 'sem acessos usando'}
              </span>
              <div className="ml-auto flex gap-1.5">
                {!selected.isSystem && !renaming && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setRenaming(true);
                      setRenameValue(selected.name);
                    }}
                  >
                    <Pencil aria-hidden className="size-4" /> Renomear
                  </Button>
                )}
                <Button type="button" variant="secondary" onClick={() => duplicate(selected)}>
                  <Copy aria-hidden className="size-4" /> Duplicar
                </Button>
                {!selected.isSystem && (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={selected.inUse > 0 || removeRole.isPending}
                    onClick={() => removeRole.mutate({ roleId: selected.id })}
                  >
                    <Trash2 aria-hidden className="size-4" /> Excluir
                  </Button>
                )}
              </div>
            </div>

            {selected.isSystem && (
              <p className="mt-2 text-[13px] text-muted">
                Papéis padrão não mudam — clique em <strong>Duplicar</strong> para criar uma
                versão customizável para esta empresa.
              </p>
            )}

            {/* Mapeamento 1:1 com as permissões do servidor — controle por item */}
            <div className="mt-4 flex flex-col gap-4">
              {unitActionGroups.map((group) => {
                const entries = unitActionCatalog.filter((entry) => entry.group === group);
                const enabledCount = entries.filter((entry) =>
                  selected.permissions.includes(entry.action),
                ).length;
                const allEnabled = enabledCount === entries.length;
                return (
                  <section key={group} className="rounded-card border border-line">
                    <header className="flex items-center gap-2.5 border-b border-line bg-paper/60 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Marcar todas as permissões de ${group}`}
                        checked={allEnabled}
                        ref={(el) => {
                          if (el) el.indeterminate = enabledCount > 0 && !allEnabled;
                        }}
                        disabled={selected.isSystem || updateRole.isPending}
                        onChange={() => toggleGroup(selected, group, !allEnabled)}
                        className="size-4 accent-[var(--color-action)]"
                      />
                      <span className="font-ui text-sm font-bold">{group}</span>
                      <span className="font-mono text-[11px] text-muted">
                        {enabledCount}/{entries.length}
                      </span>
                    </header>
                    <div className="flex flex-col divide-y divide-line">
                      {entries.map((entry) => {
                        const enabled = selected.permissions.includes(entry.action);
                        const procedures =
                          catalog.data?.actions.find((row) => row.action === entry.action)
                            ?.procedures ?? [];
                        return (
                          <div
                            key={entry.action}
                            className={`px-3 py-2.5 ${enabled ? 'bg-action-soft/20' : ''}`}
                          >
                            <label
                              className={`flex items-start gap-2.5 ${
                                selected.isSystem ? '' : 'cursor-pointer'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={enabled}
                                disabled={selected.isSystem || updateRole.isPending}
                                onChange={() => togglePermission(selected, entry.action)}
                                className="mt-0.5 size-4 accent-[var(--color-action)]"
                              />
                              <span className="flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="font-ui text-sm font-semibold">
                                    {entry.label}
                                  </span>
                                  <code className="rounded-ctl bg-paper px-1.5 py-0.5 font-mono text-[11px] text-muted">
                                    {entry.action}
                                  </code>
                                </span>
                                <span className="mt-0.5 block text-[13px] text-ink-soft">
                                  {entry.description}
                                </span>
                                <span className="mt-1.5 flex flex-wrap gap-1.5">
                                  {procedures.map((path) => (
                                    <code
                                      key={path}
                                      className={`rounded-ctl px-1.5 py-0.5 font-mono text-[11px] ${
                                        enabled
                                          ? 'bg-action-soft text-action'
                                          : 'bg-paper text-muted'
                                      }`}
                                    >
                                      {path}
                                    </code>
                                  ))}
                                </span>
                              </span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              {/* Leitura: liberada a qualquer membro */}
              <div className="rounded-card border border-line bg-paper/60 p-3">
                <p className="font-ui text-sm font-semibold">
                  Leitura{' '}
                  <span className="font-normal text-muted">
                    — sempre liberada a qualquer membro da unidade
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                  {catalog.data?.memberReads.map((path) => (
                    <code
                      key={path}
                      className="rounded-ctl bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted"
                    >
                      {path}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}
