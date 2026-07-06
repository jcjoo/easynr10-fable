import { describe, expect, test } from 'bun:test';
import { sortRows, sortSearch, toggleSort } from '../src/components/ui/sortable';

describe('sortRows', () => {
  const rows = [
    { name: 'bravo', due: '2026-02-01', size: 30 },
    { name: 'alfa', due: null, size: 10 },
    { name: 'charlie', due: '2026-01-01', size: 20 },
  ];

  test('ordena por acessor de texto', () => {
    expect(sortRows(rows, (row) => row.name, 'asc').map((row) => row.name)).toEqual([
      'alfa',
      'bravo',
      'charlie',
    ]);
  });

  test('nulos sempre no fim, em ambas as direções', () => {
    expect(sortRows(rows, (row) => row.due, 'asc').map((row) => row.name)).toEqual([
      'charlie',
      'bravo',
      'alfa',
    ]);
    expect(sortRows(rows, (row) => row.due, 'desc').map((row) => row.name)).toEqual([
      'bravo',
      'charlie',
      'alfa',
    ]);
  });

  test('números comparam numericamente e desc inverte', () => {
    expect(sortRows(rows, (row) => row.size, 'desc').map((row) => row.size)).toEqual([
      30, 20, 10,
    ]);
  });

  test('não muta a lista original e aceita comparador custom', () => {
    const original = [...rows];
    sortRows(rows, (row) => row.name, 'asc');
    expect(rows).toEqual(original);
    const inverted = sortRows(rows, (row) => row.name, 'asc', (a, b) => b.localeCompare(a));
    expect(inverted[0]?.name).toBe('charlie');
  });
});

describe('toggleSort', () => {
  test('coluna nova começa asc', () => {
    expect(toggleSort({ ord: 'nome', dir: 'asc' }, 'venc', 'nome')).toEqual({
      ord: 'venc',
      dir: 'asc',
    });
  });

  test('mesma coluna alterna asc/desc', () => {
    expect(toggleSort({ ord: 'venc', dir: 'asc' }, 'venc', 'nome')).toEqual({
      ord: 'venc',
      dir: 'desc',
    });
    expect(toggleSort({ ord: 'venc', dir: 'desc' }, 'venc', 'nome')).toEqual({
      ord: 'venc',
      dir: 'asc',
    });
  });

  test('estado vazio usa a coluna default (clicar nela alterna)', () => {
    expect(toggleSort({}, 'nome', 'nome')).toEqual({ ord: 'nome', dir: 'desc' });
  });
});

describe('sortSearch', () => {
  test('extrai apenas valores válidos da URL', () => {
    expect(sortSearch({ ord: 'venc', dir: 'desc' })).toEqual({ ord: 'venc', dir: 'desc' });
    expect(sortSearch({ ord: 42, dir: 'sideways' })).toEqual({ ord: undefined, dir: undefined });
  });
});
