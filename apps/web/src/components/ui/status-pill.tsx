import {
  actionPriorityLabels,
  actionStatusLabels,
  diagnosticStatusLabels,
  documentSituationLabels,
  type ActionPriority,
  type ActionStatus,
  type DiagnosticStatus,
  type DocumentSituation,
} from '@easynr10/shared';
import { Pill } from './pill';

// Pills semânticas do sistema — todas com o mesmo corpo (ui/pill.tsx); aqui
// vivem apenas os mapas de cor de cada domínio.

// Escala de aderência (5 níveis) definida pelo usuário. Item sem diagnóstico
// usa 'sem_avaliacao'.
export type AdherenceStatus = DiagnosticStatus | 'sem_avaliacao';

const adherenceColors: Record<AdherenceStatus, string> = {
  inexistente: 'text-bad bg-bad-soft',
  inadequada: 'text-alert bg-alert-soft',
  parcial: 'text-warn bg-warn-soft',
  suficiente: 'text-suf bg-suf-soft',
  plena: 'text-ok bg-ok-soft',
  sem_avaliacao: 'text-idle bg-idle-soft',
};

// Pontos correspondentes para chips de filtro (FilterChips).
export const adherenceDots: Record<AdherenceStatus, string> = {
  inexistente: 'bg-bad',
  inadequada: 'bg-alert',
  parcial: 'bg-warn',
  suficiente: 'bg-suf',
  plena: 'bg-ok',
  sem_avaliacao: 'bg-idle',
};

export function statusPillLabel(status: AdherenceStatus) {
  return status === 'sem_avaliacao' ? 'Sem avaliação' : diagnosticStatusLabels[status];
}

export function StatusPill({ status }: { status: AdherenceStatus }) {
  return <Pill label={statusPillLabel(status)} className={adherenceColors[status]} />;
}

// Situação de validade de documento do P.I.E.
const situationColors: Record<DocumentSituation, string> = {
  vencido: 'text-bad bg-bad-soft',
  a_vencer: 'text-warn bg-warn-soft',
  em_dia: 'text-ok bg-ok-soft',
  sem_validade: 'text-idle bg-idle-soft',
};

export const situationDots: Record<DocumentSituation, string> = {
  vencido: 'bg-bad',
  a_vencer: 'bg-warn',
  em_dia: 'bg-ok',
  sem_validade: 'bg-idle',
};

export function SituationPill({ situation }: { situation: DocumentSituation }) {
  return <Pill label={documentSituationLabels[situation]} className={situationColors[situation]} />;
}

// Status da ação do plano — pendente/em andamento viram "Prazo vencido" quando
// o prazo passou.
const actionColors: Record<ActionStatus, string> = {
  pendente: 'text-idle bg-idle-soft',
  em_andamento: 'text-warn bg-warn-soft',
  concluida: 'text-ok bg-ok-soft',
  cancelada: 'text-muted bg-idle-soft',
};

export function ActionStatusPill({ status, overdue }: { status: ActionStatus; overdue: boolean }) {
  if (overdue && (status === 'pendente' || status === 'em_andamento')) {
    return <Pill label="Prazo vencido" className="text-bad bg-bad-soft" />;
  }
  return <Pill label={actionStatusLabels[status]} className={actionColors[status]} />;
}

// Prioridade da ação (derivada do peso da norma no servidor).
const priorityColors: Record<ActionPriority, string> = {
  alta: 'text-bad bg-bad-soft',
  media: 'text-warn bg-warn-soft',
  baixa: 'text-ok bg-ok-soft',
};

export function PriorityPill({ priority }: { priority: ActionPriority }) {
  return <Pill label={actionPriorityLabels[priority]} className={priorityColors[priority]} />;
}
