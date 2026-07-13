import { describe, expect, test } from 'bun:test';
import {
  actionPriority,
  adherenceBand,
  unitActionCatalog,
  unitActions,
} from '../src/enums';
import { compareNormCodes, normalizeText } from '../src/lib/text';

describe('normalizeText', () => {
  test('remove acentos e caixa', () => {
    expect(normalizeText('Instalações Elétricas')).toBe('instalacoes eletricas');
    expect(normalizeText('ÀÉÎÕÜ ç')).toBe('aeiou c');
  });

  test('tolera nulo e indefinido', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('compareNormCodes', () => {
  test('ordena numericamente por segmento (10.2 antes de 10.11)', () => {
    expect(compareNormCodes('10.2', '10.11')).toBeLessThan(0);
    expect(compareNormCodes('10.11', '10.2')).toBeGreaterThan(0);
  });

  test('sufixos alfabéticos desempatam (10.2.4a < 10.2.4b)', () => {
    expect(compareNormCodes('10.2.4a', '10.2.4b')).toBeLessThan(0);
  });

  test('códigos iguais empatam; prefixo vem antes', () => {
    expect(compareNormCodes('10.2.4', '10.2.4')).toBe(0);
    expect(compareNormCodes('10.2', '10.2.1')).toBeLessThan(0);
  });

  test('ordena lista completa como esperado', () => {
    const codes = ['10.11.7', '10.2.4b', '10.2.4a', '10.2', '10.10'];
    expect([...codes].sort(compareNormCodes)).toEqual([
      '10.2',
      '10.2.4a',
      '10.2.4b',
      '10.10',
      '10.11.7',
    ]);
  });
});

describe('actionPriority', () => {
  test('peso máximo com aderência inexistente → prioridade alta (0%)', () => {
    expect(actionPriority(4, 'inexistente')).toEqual({ percent: 0, priority: 'alta' });
  });

  test('fronteira de 50% ainda é alta (peso 4, parcial)', () => {
    // risco = (4 − 2) × 4 = 8 → percent = 100 × (16 − 8)/16 = 50
    expect(actionPriority(4, 'parcial')).toEqual({ percent: 50, priority: 'alta' });
  });

  test('risco moderado → média', () => {
    // risco = (4 − 2) × 1 = 2 → percent = round(100 × 14/16) = 88
    expect(actionPriority(1, 'parcial')).toEqual({ percent: 88, priority: 'media' });
  });

  test('aderência plena → baixa (100%)', () => {
    expect(actionPriority(4, 'plena')).toEqual({ percent: 100, priority: 'baixa' });
  });
});

describe('adherenceBand', () => {
  test('faixas nos limites', () => {
    expect(adherenceBand(0).status).toBe('inexistente');
    expect(adherenceBand(20).status).toBe('inexistente');
    expect(adherenceBand(21).status).toBe('inadequada');
    expect(adherenceBand(70).status).toBe('parcial');
    expect(adherenceBand(90).status).toBe('suficiente');
    expect(adherenceBand(100).status).toBe('plena');
  });
});

describe('catálogo de permissões', () => {
  test('ações são únicas e todo módulo tem a leitura "*.ler"', () => {
    expect(new Set(unitActions).size).toBe(unitActions.length);
    const groups = new Set(unitActionCatalog.map((entry) => entry.group));
    // Grupos transversais (não são módulos de navegação — nada para "ler").
    const crossCutting = new Set(['Exclusão definitiva']);
    // Cada grupo-módulo do catálogo expõe pelo menos uma ação de leitura.
    for (const group of groups) {
      if (crossCutting.has(group)) continue;
      const actions = unitActionCatalog
        .filter((entry) => entry.group === group)
        .map((entry) => entry.action);
      expect(actions.some((action) => action.endsWith('.ler'))).toBe(true);
    }
  });
});
