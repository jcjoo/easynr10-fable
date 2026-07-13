import type { DocumentSituation } from './enums';

// Regra ÚNICA de vencimento de documentos, compartilhada por web e api —
// antes cada tela calculava "dias para vencer" à sua maneira (fuso local +
// ceil no front, UTC + round no back), divergindo no dia da virada.

export const DEFAULT_WARN_DAYS = 30;

// Data de calendário local em YYYY-MM-DD (o "hoje" do usuário).
export function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

// Dias de calendário até a data (negativo = vencido; 0 = vence hoje).
// Datas puras (YYYY-MM-DD) comparadas em UTC — diferença sempre inteira.
export function daysUntilExpiry(expiresAt: string, today: string = localDateString()): number {
  return Math.round(
    (Date.parse(`${expiresAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
}

// Situação de validade derivada de expires_at + warn_days_before (janela de
// aviso própria do documento; default 30 dias).
export function documentSituation(
  expiresAt: string | null,
  warnDaysBefore: number | null,
  today: string = localDateString(),
): { situation: DocumentSituation; daysToExpiry: number | null } {
  if (!expiresAt) return { situation: 'sem_validade', daysToExpiry: null };
  const days = daysUntilExpiry(expiresAt, today);
  if (days < 0) return { situation: 'vencido', daysToExpiry: days };
  if (days <= (warnDaysBefore ?? DEFAULT_WARN_DAYS)) {
    return { situation: 'a_vencer', daysToExpiry: days };
  }
  return { situation: 'em_dia', daysToExpiry: days };
}
