import { describe, expect, test } from 'bun:test';
import { daysUntilExpiry, documentSituation, localDateString } from '../src/lib/expiry';

describe('daysUntilExpiry', () => {
  test('conta dias de calendário (negativo = vencido; 0 = hoje)', () => {
    expect(daysUntilExpiry('2026-07-05', '2026-07-05')).toBe(0);
    expect(daysUntilExpiry('2026-07-04', '2026-07-05')).toBe(-1);
    expect(daysUntilExpiry('2026-08-05', '2026-07-05')).toBe(31);
  });

  test('atravessa meses e anos sem drift', () => {
    expect(daysUntilExpiry('2027-01-01', '2026-12-31')).toBe(1);
    expect(daysUntilExpiry('2028-07-05', '2026-07-05')).toBe(731); // 2028 bissexto
  });
});

describe('documentSituation', () => {
  const today = '2026-07-05';

  test('cobre as quatro situações', () => {
    expect(documentSituation(null, null, today).situation).toBe('sem_validade');
    expect(documentSituation('2026-07-01', null, today).situation).toBe('vencido');
    expect(documentSituation('2026-07-20', null, today).situation).toBe('a_vencer');
    expect(documentSituation('2026-12-01', null, today).situation).toBe('em_dia');
  });

  test('janela de aviso própria substitui o default de 30 dias', () => {
    expect(documentSituation('2026-07-20', 5, today).situation).toBe('em_dia');
    expect(documentSituation('2026-07-09', 5, today).situation).toBe('a_vencer');
  });
});

describe('localDateString', () => {
  test('formata a data local como YYYY-MM-DD', () => {
    expect(localDateString(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});
