import { describe, expect, test } from 'bun:test';
import {
  nr10GroupFor,
  nr10GroupIndicator,
  nr10Groups,
  summarizeNr10Groups,
  weightedAdherencePercent,
  type Nr10GroupItem,
} from '../src/nr10-groups';

describe('nr10GroupFor', () => {
  test('prefixo mais específico vence (10.2.8/10.2.9 antes de 10.2)', () => {
    expect(nr10GroupFor('10.2.1')?.letter).toBe('A');
    expect(nr10GroupFor('10.2.4a')?.letter).toBe('A');
    expect(nr10GroupFor('10.2.8.2.1')?.letter).toBe('B');
    expect(nr10GroupFor('10.2.9.3')?.letter).toBe('C');
  });

  test('10.10/10.11 não caem no 10.1 (não existe grupo 10.1)', () => {
    expect(nr10GroupFor('10.10.1')?.letter).toBe('K');
    expect(nr10GroupFor('10.11.7')?.letter).toBe('L');
    expect(nr10GroupFor('10.14.4')?.letter).toBe('O');
  });

  test('código fora do checklist → null', () => {
    expect(nr10GroupFor('12.1.1')).toBeNull();
    expect(nr10GroupFor('10.15')).toBeNull();
  });

  test('grupos A–O na ordem da planilha, requisitos únicos', () => {
    expect(nr10Groups.map((group) => group.letter).join('')).toBe('ABCDEFGHIJKLMNO');
    expect(new Set(nr10Groups.map((group) => group.requirement)).size).toBe(nr10Groups.length);
  });
});

describe('nr10GroupIndicator', () => {
  // Faixas da legenda da planilha: 0–20 / 21–40 / 41–60 / 61–80 / 81–100.
  test('faixas nos limites', () => {
    expect(nr10GroupIndicator(0)).toBe('inexistente');
    expect(nr10GroupIndicator(20)).toBe('inexistente');
    expect(nr10GroupIndicator(21)).toBe('inadequada');
    expect(nr10GroupIndicator(40)).toBe('inadequada');
    expect(nr10GroupIndicator(60)).toBe('parcial');
    expect(nr10GroupIndicator(80)).toBe('suficiente');
    expect(nr10GroupIndicator(81)).toBe('plena');
    expect(nr10GroupIndicator(100)).toBe('plena');
  });

  test('exemplos da planilha (após arredondar)', () => {
    expect(nr10GroupIndicator(85)).toBe('plena'); // grupo A: 84,80% → 85
    expect(nr10GroupIndicator(75)).toBe('suficiente'); // grupo C: 75,00%
    expect(nr10GroupIndicator(58)).toBe('parcial'); // grupo F: 58,33% → 58
    expect(nr10GroupIndicator(20)).toBe('inexistente'); // grupo H: 20,00%
  });
});

describe('weightedAdherencePercent', () => {
  test('média ponderada só dos avaliados', () => {
    expect(
      weightedAdherencePercent([
        { importanceWeight: 4, status: 'plena' },
        { importanceWeight: 4, status: 'inexistente' },
        { importanceWeight: 2, status: null }, // sem avaliação não entra
      ]),
    ).toBe(50);
  });

  test('nada avaliado → null (ausência, não zero)', () => {
    expect(weightedAdherencePercent([{ importanceWeight: 4, status: null }])).toBeNull();
    expect(weightedAdherencePercent([])).toBeNull();
  });
});

describe('summarizeNr10Groups', () => {
  const items: Nr10GroupItem[] = [
    // Grupo B (10.2.8): planilha Σ(nota×peso)=56, Σ(4×peso)=64 → 87,5% → 88.
    { normCode: '10.2.8.1', importanceWeight: 4, status: 'plena' },
    { normCode: '10.2.8.2', importanceWeight: 4, status: 'plena' },
    { normCode: '10.2.8.2.1', importanceWeight: 4, status: 'plena' },
    { normCode: '10.2.8.3', importanceWeight: 4, status: 'parcial' },
    // Grupo H (10.7): tudo inexistente → 0%.
    { normCode: '10.7.1', importanceWeight: 4, status: 'inexistente' },
    // Grupo K (10.10): sem avaliação.
    { normCode: '10.10.1', importanceWeight: 1, status: null },
  ];
  const byLetter = Object.fromEntries(
    summarizeNr10Groups(items).map((summary) => [summary.group.letter, summary]),
  );

  test('sempre retorna os 15 grupos, na ordem A–O', () => {
    expect(summarizeNr10Groups(items)).toHaveLength(15);
    expect(summarizeNr10Groups([]).every((s) => s.adherencePercent === null)).toBe(true);
  });

  test('aderência e indicador do grupo (exemplo da planilha, grupo B)', () => {
    expect(byLetter.B).toMatchObject({
      total: 4,
      evaluated: 4,
      adherencePercent: 88,
      indicator: 'plena',
    });
  });

  test('prioridade do grupo = média dos percentuais dos itens', () => {
    // B: três itens plenos (100) + um parcial peso 4 (50) → 88 → média.
    expect(byLetter.B).toMatchObject({ priorityPercent: 88, priority: 'media' });
    // H: inexistente peso 4 → 0% → alta.
    expect(byLetter.H).toMatchObject({
      adherencePercent: 0,
      indicator: 'inexistente',
      priorityPercent: 0,
      priority: 'alta',
    });
  });

  test('grupo sem avaliação zera os agregados em null', () => {
    expect(byLetter.K).toMatchObject({
      total: 1,
      evaluated: 0,
      adherencePercent: null,
      indicator: null,
      priorityPercent: null,
      priority: null,
    });
  });
});
