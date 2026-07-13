import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { AlertStrip } from '@/components/ui/alert-strip';
import { Field } from '@/components/ui/field';
import { SelectField } from '@/components/ui/select';

// Criação de usuário PELA EMPRESA: nasce como client, já vinculado às
// unidades marcadas com o papel escolhido (papéis da própria empresa).

export function CompanyUserCreateDialog({
  companyId,
  open,
  onClose,
}: {
  companyId: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const units = useQuery({
    ...trpc.units.listByCompany.queryOptions({ companyId }),
    enabled: open,
  });
  const roles = useQuery({
    ...trpc.users.roles.queryOptions({ companyId }),
    enabled: open,
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const effectiveRole = roleId || (roles.data?.[0]?.id ?? '');

  const create = useMutation(
    trpc.users.createForCompany.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.users.listByCompany.queryKey({ companyId }),
        });
        queryClient.invalidateQueries({ queryKey: trpc.users.list.queryKey() });
        setName('');
        setEmail('');
        setPassword('');
        setRoleId('');
        setSelectedUnits(new Set());
        onClose();
      },
    }),
  );

  const toggleUnit = (unitId: string) =>
    setSelectedUnits((state) => {
      const next = new Set(state);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });

  const canSubmit =
    name.trim().length >= 2 &&
    email.trim().length > 3 &&
    password.length >= 8 &&
    effectiveRole !== '' &&
    selectedUnits.size > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Novo usuário da empresa"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="company-user-form" disabled={!canSubmit || create.isPending}>
            {create.isPending ? 'Criando…' : 'Criar usuário'}
          </Button>
        </>
      }
    >
      <form
        id="company-user-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          create.mutate({
            companyId,
            name: name.trim(),
            email: email.trim(),
            password,
            roleId: effectiveRole,
            unitIds: [...selectedUnits],
          });
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Field
          label="E-mail"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-col gap-4 sm:flex-row">
          <Field
            label="Senha"
            type="password"
            required
            hint="Mínimo de 8 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1"
          />
          <SelectField
            label="Papel nas unidades"
            value={effectiveRole}
            onChange={(e) => setRoleId(e.target.value)}
            className="flex-1"
          >
            {roles.data?.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="rounded-card border border-line p-3">
          <p className="font-ui text-caption font-semibold">
            Unidades liberadas{' '}
            <span className="font-normal text-muted">(pelo menos uma)</span>
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {units.data?.map((unit) => (
              <label key={unit.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedUnits.has(unit.id)}
                  onChange={() => toggleUnit(unit.id)}
                  className="size-4 accent-action"
                />
                {unit.name}
              </label>
            ))}
            {units.data?.length === 0 && (
              <p className="text-sm text-muted">A empresa ainda não tem unidades.</p>
            )}
          </div>
        </div>

        {create.error && <AlertStrip>{create.error.message}</AlertStrip>}
      </form>
    </Dialog>
  );
}
