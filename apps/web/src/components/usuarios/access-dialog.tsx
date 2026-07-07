import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

// Acessos por unidade (membership + papel). Os papéis são POR EMPRESA
// (padrões do sistema + customizados da empresa), então cada bloco de
// empresa carrega os seus. Marcar libera com o primeiro papel (Gestor);
// cada unidade liberada tem um select para trocar.

interface AccessUser {
  id: string;
  name: string;
  role: string;
}

function CompanyAccess({
  user,
  company,
  roleByUnit,
  pending,
  onGrant,
  onRevoke,
}: {
  user: AccessUser;
  company: { id: string; name: string; units: { id: string; name: string }[] };
  roleByUnit: Map<string, string>;
  pending: boolean;
  onGrant: (unitIds: string[], roleId: string) => void;
  onRevoke: (unitIds: string[]) => void;
}) {
  const roles = useQuery(trpc.users.roles.queryOptions({ companyId: company.id }));
  const defaultRoleId = roles.data?.[0]?.id ?? '';

  const unitIds = company.units.map((unit) => unit.id);
  const grantedCount = unitIds.filter((id) => roleByUnit.has(id)).length;
  const allGranted = unitIds.length > 0 && grantedCount === unitIds.length;
  const toggleAll = () => {
    if (allGranted) onRevoke(unitIds);
    else if (defaultRoleId) onGrant(unitIds, defaultRoleId);
  };

  return (
    <div className="rounded-card border border-line p-3">
      <label className="flex cursor-pointer items-center gap-2 font-ui text-sm font-semibold">
        <input
          type="checkbox"
          checked={allGranted}
          ref={(el) => {
            if (el) el.indeterminate = grantedCount > 0 && !allGranted;
          }}
          disabled={pending || unitIds.length === 0 || !defaultRoleId}
          onChange={toggleAll}
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
          {company.units.map((unit) => {
            const currentRole = roleByUnit.get(unit.id);
            return (
              <div key={unit.id} className="flex items-center gap-2 text-sm">
                <label className="flex flex-1 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(currentRole)}
                    disabled={pending || !defaultRoleId}
                    onChange={() =>
                      currentRole ? onRevoke([unit.id]) : onGrant([unit.id], defaultRoleId)
                    }
                    className="size-4 accent-[var(--color-action)]"
                  />
                  {unit.name}
                </label>
                {currentRole && (
                  <select
                    aria-label={`Papel de ${user.name} em ${unit.name}`}
                    value={currentRole}
                    disabled={pending}
                    onChange={(e) => onGrant([unit.id], e.target.value)}
                    className="rounded-ctl border border-line-strong bg-surface px-2 py-1 text-caption"
                  >
                    {roles.data?.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AccessDialog({
  user,
  onClose,
  companyId,
}: {
  user: AccessUser;
  onClose: () => void;
  /** Quando presente, mostra e gerencia só as unidades desta empresa. */
  companyId?: string;
}) {
  const queryClient = useQueryClient();
  const tree = useQuery(trpc.users.accessTree.queryOptions());
  const memberships = useQuery(trpc.users.memberships.queryOptions({ userId: user.id }));

  const roleByUnit = new Map(memberships.data?.map((row) => [row.unitId, row.roleId]));
  const scopedTree = companyId
    ? (tree.data ?? []).filter((company) => company.id === companyId)
    : (tree.data ?? []);
  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: trpc.users.memberships.queryKey({ userId: user.id }),
    });
    if (companyId) {
      queryClient.invalidateQueries({
        queryKey: trpc.users.listByCompany.queryKey({ companyId }),
      });
    }
  };
  const grant = useMutation(trpc.users.grant.mutationOptions({ onSuccess: invalidate }));
  const revoke = useMutation(trpc.users.revoke.mutationOptions({ onSuccess: invalidate }));
  const pending = grant.isPending || revoke.isPending || memberships.isLoading;

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
              Marque as unidades que <strong>{user.name}</strong> pode acessar — o vínculo
              nasce como <strong>Gestor</strong> e o papel pode ser trocado ao lado de cada
              unidade. Papéis são configurados por empresa na tela{' '}
              <strong>Papéis</strong>.
            </p>

            {scopedTree.length === 0 && (
              <p className="text-sm text-muted">Nenhuma empresa cadastrada.</p>
            )}

            {scopedTree.map((company) => (
              <CompanyAccess
                key={company.id}
                user={user}
                company={company}
                roleByUnit={roleByUnit}
                pending={pending}
                onGrant={(unitIds, roleId) =>
                  grant.mutate({ userId: user.id, unitIds, roleId })
                }
                onRevoke={(unitIds) => revoke.mutate({ userId: user.id, unitIds })}
              />
            ))}

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
