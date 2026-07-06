// Funções puras da camada de relatórios: média ponderada e situação de
// validade (hoje é passado por parâmetro — determinístico).
import { describe, expect, test } from 'bun:test';
import { documentSituation, weightedPercent } from '../src/services/reports';

describe('weightedPercent', () => {
  test('nada avaliado → null (não zero)', () => {
    expect(weightedPercent([])).toBeNull();
    expect(weightedPercent([{ importanceWeight: 4, status: null }])).toBeNull();
  });

  test('média ponderada pelo peso, só dos avaliados', () => {
    expect(
      weightedPercent([
        { importanceWeight: 4, status: 'parcial' }, // 0,5
        { importanceWeight: 1, status: 'plena' }, // 1
        { importanceWeight: 99, status: null }, // fora da conta
      ]),
    ).toBe(60);
  });

  test('extremos: tudo plena = 100, tudo inexistente = 0', () => {
    expect(weightedPercent([{ importanceWeight: 2, status: 'plena' }])).toBe(100);
    expect(weightedPercent([{ importanceWeight: 2, status: 'inexistente' }])).toBe(0);
  });
});

describe('documentSituation', () => {
  const today = '2026-07-05';

  test('sem validade', () => {
    expect(documentSituation(null, null, today)).toEqual({
      situation: 'sem_validade',
      daysToExpiry: null,
    });
  });

  test('vencido ontem', () => {
    expect(documentSituation('2026-07-04', null, today)).toEqual({
      situation: 'vencido',
      daysToExpiry: -1,
    });
  });

  test('vence hoje conta como a vencer (dia 0)', () => {
    expect(documentSituation('2026-07-05', null, today).situation).toBe('a_vencer');
  });

  test('janela de aviso: default 30 dias, customizável por documento', () => {
    expect(documentSituation('2026-08-04', null, today).situation).toBe('a_vencer'); // 30 dias
    expect(documentSituation('2026-08-05', null, today).situation).toBe('em_dia'); // 31 dias
    expect(documentSituation('2026-07-15', 5, today).situation).toBe('em_dia'); // janela própria
    expect(documentSituation('2026-07-09', 5, today).situation).toBe('a_vencer');
  });
});
