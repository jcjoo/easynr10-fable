// Tipos enumerados do dicionário de dados (projeto.md §7.3).

export const userRoles = ['admin', 'client'] as const;
export type UserRole = (typeof userRoles)[number];

export const memberRoles = ['manager', 'viewer'] as const;
export type MemberRole = (typeof memberRoles)[number];

// Aderência do item à norma. Item sem diagnóstico = "sem avaliação" (ausência
// de registro, não um valor do enum); item fora de escopo usa is_active.
export const diagnosticStatuses = [
  'insuficiente',
  'parcial',
  'suficiente',
  'conforme',
] as const;
export type DiagnosticStatus = (typeof diagnosticStatuses)[number];

export const actionStatuses = [
  'pendente',
  'em_andamento',
  'concluida',
  'cancelada',
] as const;
export type ActionStatus = (typeof actionStatuses)[number];

export const requirementTypes = ['document', 'opinion', 'group'] as const;
export type RequirementType = (typeof requirementTypes)[number];

export const groupKinds = ['custom', 'colaboradores', 'equipamentos'] as const;
export type GroupKind = (typeof groupKinds)[number];

export const equipmentTypes = ['eletrico', 'ferramenta', 'epi', 'epc'] as const;
export type EquipmentType = (typeof equipmentTypes)[number];

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
