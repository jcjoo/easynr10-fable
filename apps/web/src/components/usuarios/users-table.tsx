import { useState, type ReactNode } from 'react';
import { normalizeText } from '@easynr10/shared';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { Td } from '@/components/ui/table';
import {
  PlainTh,
  SortableTh,
  sortRows,
  toggleSort,
  type SortState,
  type SortValue,
} from '@/components/ui/sortable';

// Tabela única de usuários das Configurações (global/empresa/unidade) —
// as variações são o cabeçalho da coluna de papéis e o conteúdo dela.
// Ordenação local (estado da tela, não URL — Configurações não indexa).

// Resumo de papéis por unidade (ex.: Gestor ×2) — usado nas 3 visões.
export function RolesPills({ unitRoles }: { unitRoles: { name: string; units: number }[] }) {
  if (unitRoles.length === 0) {
    return <span className="text-caption text-muted">Sem acessos</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {unitRoles.map((entry) => (
        <Pill
          key={entry.name}
          label={entry.units > 1 ? `${entry.name} ×${entry.units}` : entry.name}
          className="bg-suf-soft text-suf"
        />
      ))}
    </div>
  );
}

export interface UserTableRow {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string | Date;
  /** Conteúdo da coluna de papéis, já montado pelo chamador. */
  rolesNode: ReactNode;
  /** Valor de ordenação da coluna de papéis. */
  rolesSort: string;
}

export function UsersTable({
  rows,
  rolesHeader,
  showGlobalRole = false,
  emptyMessage,
  onManage,
}: {
  rows: UserTableRow[];
  rolesHeader: string;
  showGlobalRole?: boolean;
  emptyMessage: string;
  onManage: (row: UserTableRow) => void;
}) {
  const [sort, setSort] = useState<SortState>({});
  const currentOrd = sort.ord ?? 'nome';
  const currentDir = sort.dir ?? 'asc';
  const accessors: Record<string, (row: UserTableRow) => SortValue> = {
    nome: (row) => normalizeText(row.name),
    email: (row) => normalizeText(row.email),
    papel: (row) => (row.role === 'admin' ? 0 : 1),
    papeis: (row) => normalizeText(row.rolesSort),
    cadastro: (row) => new Date(row.createdAt).getTime(),
  };
  const sorted = sortRows(rows, accessors[currentOrd] ?? accessors.nome!, currentDir);
  const handleSort = (key: string) => setSort((state) => toggleSort(state, key, 'nome'));

  const columns: [string, string][] = [
    ['nome', 'Nome'],
    ['email', 'E-mail'],
    ...(showGlobalRole ? ([['papel', 'Papel global']] as [string, string][]) : []),
    ['papeis', rolesHeader],
    ['cadastro', 'Cadastro'],
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map(([key, label]) => (
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
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="px-3.5 py-12 text-center text-muted">
                {emptyMessage}
              </td>
            </tr>
          )}
          {sorted.map((row) => (
            <tr key={row.id} className="hover:bg-paper">
              <Td className="w-full font-medium">{row.name}</Td>
              <Td className="text-muted">{row.email}</Td>
              {showGlobalRole && (
                <Td>
                  <Pill
                    label={row.role === 'admin' ? 'Admin' : 'Usuário'}
                    className={
                      row.role === 'admin' ? 'bg-action-soft text-action' : 'bg-idle-soft text-idle'
                    }
                  />
                </Td>
              )}
              <Td>{row.rolesNode}</Td>
              <Td className="tabular font-mono text-caption">{formatDate(row.createdAt)}</Td>
              <Td>
                <div className="flex justify-end">
                  <Button type="button" variant="secondary" onClick={() => onManage(row)}>
                    Gerenciar acessos
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
