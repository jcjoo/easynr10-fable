import {
  actionPriority,
  diagnosticStatusScore,
  type ActionPriority,
  type DiagnosticStatus,
} from './enums';

// Estrutura de grupos do checklist NR-10 (planilha "ChecklistNR10 —
// resumo_final"): cada grupo agrega os itens de um requisito raiz da norma.
// 10.2.8 e 10.2.9 são grupos próprios dentro do 10.2 — o prefixo mais
// específico vence na resolução.

export const nr10Groups = [
  { letter: 'A', requirement: '10.2', title: 'Medidas de controle' },
  { letter: 'B', requirement: '10.2.8', title: 'Medidas de proteção coletiva' },
  { letter: 'C', requirement: '10.2.9', title: 'Medidas de proteção individual' },
  { letter: 'D', requirement: '10.3', title: 'Segurança em projetos' },
  {
    letter: 'E',
    requirement: '10.4',
    title: 'Segurança na construção, montagem, operação e manutenção',
  },
  {
    letter: 'F',
    requirement: '10.5',
    title: 'Segurança em instalações elétricas desenergizadas',
  },
  { letter: 'G', requirement: '10.6', title: 'Segurança em instalações elétricas energizadas' },
  { letter: 'H', requirement: '10.7', title: 'Trabalhos envolvendo alta tensão (AT)' },
  {
    letter: 'I',
    requirement: '10.8',
    title: 'Habilitação, qualificação, capacitação e autorização dos trabalhadores',
  },
  { letter: 'J', requirement: '10.9', title: 'Proteção contra incêndio e explosão' },
  { letter: 'K', requirement: '10.10', title: 'Sinalização de segurança' },
  { letter: 'L', requirement: '10.11', title: 'Procedimentos de trabalho' },
  { letter: 'M', requirement: '10.12', title: 'Situação de emergência' },
  { letter: 'N', requirement: '10.13', title: 'Responsabilidades' },
  { letter: 'O', requirement: '10.14', title: 'Disposições finais' },
] as const;

export type Nr10Group = (typeof nr10Groups)[number];

// Prefixos mais específicos primeiro (10.2.8 antes de 10.2).
const byPrefixLength = [...nr10Groups].sort(
  (a, b) => b.requirement.length - a.requirement.length,
);

// Grupo de um código de norma: "10.2.8.2.1" cai no B, "10.2.4a" no A.
export function nr10GroupFor(normCode: string): Nr10Group | null {
  return (
    byPrefixLength.find(
      (group) => normCode === group.requirement || normCode.startsWith(`${group.requirement}.`),
    ) ?? null
  );
}

// Indicador de aderência do grupo — faixas da LEGENDA da planilha
// (0–20 / 21–40 / 41–60 / 61–80 / 81–100). São faixas diferentes das da
// aderência geral da unidade (adherenceBands: cortes em 70/90).
export function nr10GroupIndicator(percent: number): DiagnosticStatus {
  if (percent <= 20) return 'inexistente';
  if (percent <= 40) return 'inadequada';
  if (percent <= 60) return 'parcial';
  if (percent <= 80) return 'suficiente';
  return 'plena';
}

export interface Nr10GroupItem {
  normCode: string;
  importanceWeight: number;
  status: DiagnosticStatus | null;
}

export interface Nr10GroupSummary {
  group: Nr10Group;
  /** Itens no escopo do grupo (ativos). */
  total: number;
  /** Itens com diagnóstico registrado. */
  evaluated: number;
  /** Σ(nota×peso) / Σ(4×peso) dos avaliados; null sem avaliação. */
  adherencePercent: number | null;
  indicator: DiagnosticStatus | null;
  /** Média dos percentuais de prioridade dos itens (régua do plano de ação). */
  priorityPercent: number | null;
  priority: ActionPriority | null;
}

// Média ponderada da aderência (mesma conta da aderência geral do painel):
// só itens avaliados entram; sem avaliação não é nota zero, é ausência.
export function weightedAdherencePercent(
  rows: { importanceWeight: number; status: DiagnosticStatus | null; score?: number | null }[],
): number | null {
  const evaluated = rows.filter((row) => row.status !== null);
  const weightSum = evaluated.reduce((sum, row) => sum + row.importanceWeight, 0);
  if (weightSum === 0) return null;
  // Nota do item = média exata das evidências (score 0..100). Fallback ao score
  // do status para linhas antigas sem score.
  const scoreSum = evaluated.reduce(
    (sum, row) =>
      sum +
      row.importanceWeight *
        (row.score != null ? row.score / 100 : diagnosticStatusScore[row.status!]),
    0,
  );
  return Math.round((scoreSum / weightSum) * 100);
}

// Linhas da planilha: um resumo por grupo, na ordem A–O. A prioridade do
// grupo é a média dos percentuais de prioridade dos itens avaliados, com a
// mesma régua do plano (≤50 alta · ≤90 média · acima, baixa).
export function summarizeNr10Groups(items: Nr10GroupItem[]): Nr10GroupSummary[] {
  return nr10Groups.map((group) => {
    const rows = items.filter((item) => nr10GroupFor(item.normCode) === group);
    const evaluated = rows.filter((row) => row.status !== null);
    const adherencePercent = weightedAdherencePercent(rows);
    if (adherencePercent === null) {
      return {
        group,
        total: rows.length,
        evaluated: evaluated.length,
        adherencePercent: null,
        indicator: null,
        priorityPercent: null,
        priority: null,
      };
    }
    const priorityPercent = Math.round(
      evaluated.reduce(
        (sum, row) => sum + actionPriority(row.importanceWeight, row.status!).percent,
        0,
      ) / evaluated.length,
    );
    return {
      group,
      total: rows.length,
      evaluated: evaluated.length,
      adherencePercent,
      indicator: nr10GroupIndicator(adherencePercent),
      priorityPercent,
      priority: priorityPercent <= 50 ? 'alta' : priorityPercent <= 90 ? 'media' : 'baixa',
    };
  });
}
