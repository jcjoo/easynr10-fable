import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { userRoles, type UserRole } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { SelectField } from '@/components/ui/select';

// Criação de usuário pelo admin (RF03): conta via better-auth no servidor
// (hash/sessões) + papel global. O acesso às unidades é liberado depois,
// em "Gerenciar acessos".

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin (consultor PSO)',
  client: 'Usuário',
};

export function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('client');

  const create = useMutation(
    trpc.users.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.users.list.queryKey() });
        setName('');
        setEmail('');
        setPassword('');
        setRole('client');
        onClose();
      },
    }),
  );

  return (
    <Dialog open={open} onClose={onClose} title="Novo usuário">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name: name.trim(), email: email.trim(), password, role });
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
        <div className="flex gap-4">
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
            label="Papel global"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="flex-1"
          >
            {userRoles.map((value) => (
              <option key={value} value={value}>
                {roleLabels[value]}
              </option>
            ))}
          </SelectField>
        </div>
        {create.error && (
          <p role="alert" className="text-sm text-bad">
            {create.error.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={!name.trim() || !email.trim() || password.length < 8 || create.isPending}
          >
            {create.isPending ? 'Criando…' : 'Criar usuário'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
