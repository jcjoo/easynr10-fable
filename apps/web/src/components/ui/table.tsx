import type { TdHTMLAttributes } from 'react';

// Célula padrão das tabelas de listagem — borda e respiro definidos UMA vez
// (antes cada tabela repetia border-b border-line px-3.5 py-2.5). Casos fora
// do padrão (ex.: célula de estado vazio com colSpan) seguem no <td> nativo.
export function Td({ className = '', ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`border-b border-line px-3.5 py-2.5 ${className}`} {...props} />;
}
