import { describe, expect, test } from 'bun:test';
import { filterByExpiry } from '../src/components/pie/expiry-filter';

// Datas relativas a hoje com folga (±10 dias) para não flakar na virada do dia.
function isoDaysFromNow(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

const DEFAULT_WARN = 30;
const rows = [
  { id: 'vencido', expiresAt: isoDaysFromNow(-10), warnDaysBefore: null },
  { id: 'perto', expiresAt: isoDaysFromNow(10), warnDaysBefore: null },
  { id: 'longe', expiresAt: isoDaysFromNow(90), warnDaysBefore: null },
  // Janela de aviso própria menor que o default: 10 dias não é "a vencer".
  { id: 'janela-curta', expiresAt: isoDaysFromNow(10), warnDaysBefore: 5 },
  { id: 'sem-validade', expiresAt: null, warnDaysBefore: null },
];

describe('filterByExpiry', () => {
  test('sem filtro devolve tudo', () => {
    expect(filterByExpiry(rows, {}, DEFAULT_WARN)).toHaveLength(rows.length);
  });

  test('vencidos: só datas passadas (sem validade fica de fora)', () => {
    expect(filterByExpiry(rows, { venc: 'vencidos' }, DEFAULT_WARN).map((r) => r.id)).toEqual([
      'vencido',
    ]);
  });

  test('a vencer respeita a janela de aviso do próprio documento', () => {
    expect(filterByExpiry(rows, { venc: 'a_vencer' }, DEFAULT_WARN).map((r) => r.id)).toEqual([
      'perto',
    ]);
  });

  test('personalizado filtra pelo intervalo de datas (inclusivo)', () => {
    const de = isoDaysFromNow(0);
    const ate = isoDaysFromNow(30);
    expect(
      filterByExpiry(rows, { venc: 'personalizado', de, ate }, DEFAULT_WARN).map((r) => r.id),
    ).toEqual(['perto', 'janela-curta']);
    // Sem período definido, personalizado não seleciona nada.
    expect(filterByExpiry(rows, { venc: 'personalizado' }, DEFAULT_WARN)).toHaveLength(0);
  });
});
