// Tipos enumerados do dicionário de dados (projeto.md §7.3).

export const userRoles = ['admin', 'client'] as const;
export type UserRole = (typeof userRoles)[number];

export const memberRoles = ['manager', 'viewer'] as const;
export type MemberRole = (typeof memberRoles)[number];

// Aderência do item à norma (escala definida pelo usuário em 03/07/2026).
// Item sem diagnóstico = "sem avaliação" (ausência de registro, não um valor
// do enum); item fora de escopo usa is_active.
export const diagnosticStatuses = [
  'inexistente',
  'inadequada',
  'parcial',
  'suficiente',
  'plena',
] as const;
export type DiagnosticStatus = (typeof diagnosticStatuses)[number];

export const diagnosticStatusLabels: Record<DiagnosticStatus, string> = {
  inexistente: 'Inexistente',
  inadequada: 'Inadequada',
  parcial: 'Parcial',
  suficiente: 'Suficiente',
  plena: 'Plena',
};

// Score do item para a aderência geral agregada (média ponderada pelo
// importance_weight da norma): 0 / 25 / 50 / 75 / 100%.
export const diagnosticStatusScore: Record<DiagnosticStatus, number> = {
  inexistente: 0,
  inadequada: 0.25,
  parcial: 0.5,
  suficiente: 0.75,
  plena: 1,
};

// Faixas da aderência agregada (%) com as frases de alerta.
export const adherenceBands = [
  {
    status: 'inexistente',
    max: 20,
    emoji: '❌',
    label: 'Inexistente',
    phrase: 'Perigo! Sua Unidade possui muitas Não conformidades em relação a NR-10.',
  },
  {
    status: 'inadequada',
    max: 40,
    emoji: '⛔',
    label: 'Inadequada',
    phrase: 'Perigo! Sua Unidade está sujeita a autuações e acidentes em relação a NR 10.',
  },
  {
    status: 'parcial',
    max: 70,
    emoji: '⚠️',
    label: 'Parcial',
    phrase: 'Alerta! Sua Unidade está sujeita a autuações em auditorias NR 10.',
  },
  {
    status: 'suficiente',
    max: 90,
    emoji: '🔷',
    label: 'Suficiente',
    phrase: 'Atenção! Sua Unidade possui pontos de melhorias em relação a NR 10.',
  },
  {
    status: 'plena',
    max: 100,
    emoji: '✅',
    label: 'Plena',
    phrase: 'Parabéns! Sua Unidade possui Plena conformidade com a NR 10.',
  },
] as const;

export function adherenceBand(percent: number) {
  return adherenceBands.find((band) => percent <= band.max) ?? adherenceBands.at(-1)!;
}

export const actionStatuses = [
  'pendente',
  'em_andamento',
  'concluida',
  'cancelada',
] as const;
export type ActionStatus = (typeof actionStatuses)[number];

export const actionStatusLabels: Record<ActionStatus, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

// Situação de validade de um documento do PIE (relatórios/dashboard):
// derivada de expires_at + warn_days_before (janela de aviso; default 30).
export const documentSituations = ['vencido', 'a_vencer', 'em_dia', 'sem_validade'] as const;
export type DocumentSituation = (typeof documentSituations)[number];

export const documentSituationLabels: Record<DocumentSituation, string> = {
  vencido: 'Vencido',
  a_vencer: 'A vencer',
  em_dia: 'Em dia',
  sem_validade: 'Sem validade',
};

// Intervalos da linha do tempo de aderência (relatório timeline do legado).
export const timelineIntervals = ['daily', 'weekly', 'monthly'] as const;
export type TimelineInterval = (typeof timelineIntervals)[number];

// Busca textual insensível a caixa e acentos (filtros de relatórios).
export function normalizeText(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Ordenação natural de códigos de norma: 10.2.4a < 10.2.4b < 10.11.7
// (ordenar como texto colocaria 10.11 antes de 10.2). Usada na API e nas
// tabelas ordenáveis do web.
export function compareNormCodes(a: string, b: string) {
  const segmentsA = a.split('.');
  const segmentsB = b.split('.');
  const length = Math.max(segmentsA.length, segmentsB.length);
  for (let index = 0; index < length; index += 1) {
    const rawA = segmentsA[index] ?? '';
    const rawB = segmentsB[index] ?? '';
    const numberA = parseInt(rawA, 10) || 0;
    const numberB = parseInt(rawB, 10) || 0;
    if (numberA !== numberB) return numberA - numberB;
    const suffixA = rawA.replace(/^\d+/, '');
    const suffixB = rawB.replace(/^\d+/, '');
    if (suffixA !== suffixB) return suffixA.localeCompare(suffixB);
  }
  return 0;
}

export const requirementTypes = ['document', 'opinion', 'group'] as const;
export type RequirementType = (typeof requirementTypes)[number];

export const equipmentTypes = ['eletrico', 'ferramenta', 'epi', 'epc'] as const;
export type EquipmentType = (typeof equipmentTypes)[number];

export const equipmentTypeLabels: Record<EquipmentType, string> = {
  eletrico: 'Equipamento elétrico',
  ferramenta: 'Ferramenta',
  epi: 'EPI',
  epc: 'EPC',
};

// Grupos fixos de cadastro (decisão do usuário em 03/07/2026: sem módulo
// genérico de grupos — requisito tipo group aponta para um destes alvos).
export const registerTargets = ['colaboradores', ...equipmentTypes] as const;
export type RegisterTarget = (typeof registerTargets)[number];

export const registerTargetLabels: Record<RegisterTarget, string> = {
  colaboradores: 'Colaboradores',
  eletrico: 'Equipamentos elétricos',
  ferramenta: 'Ferramentas',
  epi: 'EPI',
  epc: 'EPC',
};

// Módulos de cadastro (telas): Colaboradores e Equipamentos (este com abas
// por tipo). Mantido só para tipagem de UI.
export const registerModules = ['colaboradores', 'equipamentos'] as const;
export type RegisterModule = (typeof registerModules)[number];

// Campos default dos cadastros (definidos pelo sistema), POR GRUPO-ALVO —
// cada tipo de equipamento tem estrutura própria (decisão do usuário,
// 03/07/2026). kind 'document' = coluna vinculada a um documento do PIE
// (ex.: CA do EPI aponta para um Certificado de Aprovação; N itens podem
// apontar para o mesmo documento — base das automações de vencimento).
// Valores texto vivem no metadata do item; vínculos em register_document_link.
export interface RegisterField {
  key: string;
  label: string;
  kind?: 'document';
}

export const defaultRegisterFields: Record<RegisterTarget, RegisterField[]> = {
  colaboradores: [
    { key: 'funcao', label: 'Função' },
    { key: 'matricula', label: 'Matrícula' },
  ],
  eletrico: [
    { key: 'fabricante', label: 'Fabricante' },
    { key: 'identificacao', label: 'Identificação (TAG)' },
    { key: 'tensao', label: 'Tensão (V)' },
    { key: 'localizacao', label: 'Localização' },
  ],
  ferramenta: [
    { key: 'fabricante', label: 'Fabricante' },
    { key: 'modelo', label: 'Modelo' },
    { key: 'numero_serie', label: 'Nº de série' },
  ],
  epi: [
    { key: 'fabricante', label: 'Fabricante' },
    { key: 'ca', label: 'CA', kind: 'document' },
  ],
  epc: [
    { key: 'fabricante', label: 'Fabricante' },
    { key: 'localizacao', label: 'Localização' },
  ],
};

// Estrutura FIXA de pastas dos cadastros no PIE (criada sob demanda):
// Colaboradores/Lista de Colaboradores/[nome]/[estrutura opcional]
// Equipamentos/<Tipo>/Lista de <Tipo>/[nome]/[estrutura opcional]
export const registerBasePath: Record<RegisterTarget, string[]> = {
  colaboradores: ['Colaboradores', 'Lista de Colaboradores'],
  eletrico: ['Equipamentos', 'Equipamentos Elétricos', 'Lista de Equipamentos Elétricos'],
  ferramenta: ['Equipamentos', 'Ferramentas', 'Lista de Ferramentas'],
  epi: ['Equipamentos', 'EPI', 'Lista de EPI'],
  epc: ['Equipamentos', 'EPC', 'Lista de EPC'],
};

// Grupos documentais do sistema atual (default_documents do legado).
export const documentGroups = [
  'instalacoes',
  'instrucoes_e_procedimentos',
  'colaboradores',
  'equipamentos',
] as const;
export type DocumentGroup = (typeof documentGroups)[number];

export const documentGroupLabels: Record<DocumentGroup, string> = {
  instalacoes: 'Instalações',
  instrucoes_e_procedimentos: 'Instruções e Procedimentos',
  colaboradores: 'Colaboradores',
  equipamentos: 'Equipamentos',
};
