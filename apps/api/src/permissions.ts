import { appRouter } from './routers';
import type { Meta, Permission } from './trpc';

// Matriz de permissões da API, enumerada dos metadados dos procedure
// builders (trpc.ts) — sempre em sincronia com o código, sem doc manual.
// Uso: `bun run permissions` (imprime e grava PERMISSOES.md na raiz).

interface Row {
  path: string;
  type: string;
  permission: Permission | '⚠ sem-meta';
  action?: string;
}

// O router raiz expõe o mapa plano `_def.procedures` (caminho pontilhado →
// procedure); cada procedure carrega `_def.type` e o `_def.meta` do builder.
const procedures = (
  appRouter._def as unknown as {
    procedures: Record<string, { _def: { type?: string; meta?: Meta } }>;
  }
).procedures;

const rows: Row[] = Object.entries(procedures)
  .map(([path, procedure]) => ({
    path,
    type: String(procedure._def.type ?? '?'),
    permission: procedure._def.meta?.permission ?? ('⚠ sem-meta' as const),
    action: procedure._def.meta?.action,
  }))
  .sort((a, b) => a.path.localeCompare(b.path));

// Rotas HTTP fora do tRPC (main.ts / report-export.ts) — mantidas à mão.
const httpRows: Row[] = [
  { path: 'GET/POST /api/auth/*', type: 'http', permission: 'publica' },
  { path: 'GET /api/reports/export', type: 'http', permission: 'membro-da-unidade' },
  { path: 'GET /health', type: 'http', permission: 'publica' },
];

const icons: Record<string, string> = {
  publica: '🌐',
  autenticado: '🔑',
  admin: '🛡️',
  'membro-da-unidade': '🏭',
};

const lines: string[] = [
  '# Matriz de permissões da API',
  '',
  '> Gerado por `bun run permissions` a partir dos metadados dos procedure',
  '> builders (`apps/api/src/trpc.ts`). Não editar à mão.',
  '',
  '| Permissão | Significado |',
  '|---|---|',
  '| 🌐 `publica` | Sem sessão |',
  '| 🔑 `autenticado` | Qualquer usuário logado |',
  '| 🛡️ `admin` | Somente consultores PSO (role admin) |',
  '| 🏭 `membro-da-unidade` | Admin OU membro da unidade do `unitId` (isolamento de tenant) |',
  '',
  '## Procedures tRPC',
  '',
  '| Procedure | Tipo | Permissão | Ação do papel |',
  '|---|---|---|---|',
  ...rows.map(
    (row) =>
      `| \`${row.path}\` | ${row.type} | ${icons[row.permission] ?? ''} \`${row.permission}\` | ${row.action ? `\`${row.action}\`` : '—'} |`,
  ),
  '',
  '## Rotas HTTP',
  '',
  '| Rota | Tipo | Permissão |',
  '|---|---|---|',
  ...httpRows.map(
    (row) =>
      `| \`${row.path}\` | ${row.type} | ${icons[row.permission] ?? ''} \`${row.permission}\` |`,
  ),
  '',
];

const markdown = lines.join('\n');
await Bun.write(new URL('../../../PERMISSOES.md', import.meta.url), markdown);

const missing = rows.filter((row) => row.permission === '⚠ sem-meta');
const pad = Math.max(...rows.map((row) => row.path.length));
for (const row of [...rows, ...httpRows]) {
  console.log(
    `${row.path.padEnd(pad + 2)} ${row.type.padEnd(9)} ${icons[row.permission] ?? ''} ${row.permission}${row.action ? ` · ${row.action}` : ''}`,
  );
}
console.log(`\n${rows.length} procedures + ${httpRows.length} rotas HTTP → PERMISSOES.md`);
if (missing.length > 0) {
  console.error(`⚠ ${missing.length} procedure(s) sem permissão declarada!`);
  process.exit(1);
}
