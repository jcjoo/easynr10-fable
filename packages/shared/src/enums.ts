// Tipos enumerados do dicionário de dados (projeto.md §7.3).

export const userRoles = ['admin', 'client'] as const;
export type UserRole = (typeof userRoles)[number];

// Catálogo GRANULAR de permissões por unidade, mapeado pelos PAPÉIS
// (app_role.permissions) — cada item é controlável individualmente e guarda
// os endpoints correspondentes no servidor (unitAction). Cada módulo tem a
// permissão de LEITURA ("*.ler") — sem ela o módulo some da navegação e
// devolve 403 por link — e as de escrita. Admins globais ignoram papéis.
// Papéis-sistema: Gestor (tudo) e Leitor (só as leituras).
export const unitActionCatalog = [
  {
    action: 'pie.ler',
    group: 'P.I.E',
    label: 'Ver o prontuário',
    description:
      'Acessar o módulo P.I.E: pastas, documentos, versões, download e preview. Desligado, o módulo some da navegação.',
  },
  {
    action: 'pie.pasta.criar',
    group: 'P.I.E',
    label: 'Criar pastas',
    description: 'Criar novas pastas no prontuário (inclui as pastas automáticas de cadastros).',
  },
  {
    action: 'pie.pasta.renomear',
    group: 'P.I.E',
    label: 'Renomear pastas',
    description: 'Alterar o nome de pastas existentes.',
  },
  {
    action: 'pie.pasta.excluir',
    group: 'P.I.E',
    label: 'Excluir pastas',
    description: 'Excluir pastas vazias (cascata com conteúdo continua restrita a admins).',
  },
  {
    action: 'pie.documento.enviar',
    group: 'P.I.E',
    label: 'Enviar documentos',
    description: 'Fazer upload de documentos novos e de novas versões sobre documentos existentes.',
  },
  {
    action: 'pie.documento.editar',
    group: 'P.I.E',
    label: 'Editar documentos',
    description: 'Alterar nome, vencimento e antecedência de aviso de documentos.',
  },
  {
    action: 'pie.documento.excluir',
    group: 'P.I.E',
    label: 'Excluir documentos',
    description: 'Excluir documentos do prontuário (soft delete — recuperável pelo suporte).',
  },
  {
    action: 'pie.documento.restaurar',
    group: 'P.I.E',
    label: 'Restaurar versões',
    description: 'Voltar um documento para uma versão anterior (cria nova versão no histórico).',
  },
  {
    action: 'pie.estruturas.gerenciar',
    group: 'P.I.E',
    label: 'Gerenciar estruturas de pastas',
    description: 'Criar/editar esquemas de estrutura e gerá-los em pastas do prontuário.',
  },
  {
    action: 'diagnostico.ler',
    group: 'Diagnóstico',
    label: 'Ver diagnósticos',
    description:
      'Acessar o módulo Diagnóstico: itens, aderência, histórico e evidências. Desligado, o módulo some da navegação.',
  },
  {
    action: 'diagnostico.avaliar',
    group: 'Diagnóstico',
    label: 'Registrar diagnósticos',
    description:
      'Avaliar itens de adequação (aderência, prazo, parecer, evidências) — gera ações no plano.',
  },
  {
    action: 'diagnostico.configurar',
    group: 'Diagnóstico',
    label: 'Configurar itens',
    description: 'Ativar/desativar itens do escopo e editar a orientação da unidade.',
  },
  {
    action: 'diagnostico.requisitos',
    group: 'Diagnóstico',
    label: 'Gerenciar requisitos de evidência',
    description: 'Adicionar e remover os requisitos (documento/parecer/grupo) de cada item.',
  },
  {
    action: 'diagnostico.gerar',
    group: 'Diagnóstico',
    label: 'Gerar itens de adequação',
    description: 'Gerar os itens da unidade a partir do catálogo NR-10 (primeira configuração).',
  },
  {
    action: 'plano.ler',
    group: 'Plano de ação',
    label: 'Ver o plano de ação',
    description: 'Acessar o módulo Plano de Ação. Desligado, o módulo some da navegação.',
  },
  {
    action: 'plano.status',
    group: 'Plano de ação',
    label: 'Atualizar status das ações',
    description: 'Marcar ações como em andamento, concluídas ou canceladas.',
  },
  {
    action: 'cadastros.ler',
    group: 'Cadastros',
    label: 'Ver cadastros',
    description:
      'Acessar Colaboradores e Equipamentos (listas, campos e vínculos). Desligado, os módulos somem da navegação.',
  },
  {
    action: 'cadastros.itens',
    group: 'Cadastros',
    label: 'Criar/editar itens',
    description: 'Criar, editar e excluir colaboradores e equipamentos.',
  },
  {
    action: 'cadastros.importar',
    group: 'Cadastros',
    label: 'Importar por planilha',
    description: 'Importação em massa de colaboradores/equipamentos (.xlsx/.csv).',
  },
  {
    action: 'cadastros.vinculos',
    group: 'Cadastros',
    label: 'Vincular documentos',
    description: 'Vincular/desvincular documentos do P.I.E aos campos dos itens (ex.: CA do EPI).',
  },
  {
    action: 'cadastros.campos',
    group: 'Cadastros',
    label: 'Campos personalizados',
    description: 'Criar e remover campos personalizados dos grupos de cadastro.',
  },
  {
    action: 'cadastros.config',
    group: 'Cadastros',
    label: 'Configurar grupos',
    description: 'Definir a estrutura de pastas padrão de cada grupo de cadastro.',
  },
  {
    action: 'autorizacoes.ler',
    group: 'Autorizações',
    label: 'Ver autorizações',
    description:
      'Acessar Permissões de Trabalho e Fichas de EPI (lista, documentos assinados e trilha de auditoria). Desligado, o módulo some da navegação.',
  },
  {
    action: 'autorizacoes.gerar',
    group: 'Autorizações',
    label: 'Gerar e assinar autorizações',
    description:
      'Criar permissões de trabalho e fichas de EPI, colher assinatura presencial, compartilhar o link público e cancelar pendentes.',
  },
  {
    action: 'painel.ler',
    group: 'Painel',
    label: 'Ver o painel da unidade',
    description:
      'Acessar o dashboard da unidade (aderência geral, distribuição, evolução). Desligado, o módulo some da navegação.',
  },
  {
    action: 'relatorios.ler',
    group: 'Relatórios',
    label: 'Ver e exportar relatórios',
    description:
      'Acessar os relatórios analíticos e exportar CSV/PDF. Desligado, o módulo some da navegação.',
  },
  {
    action: 'exclusao.definitiva',
    group: 'Exclusão definitiva',
    label: 'Excluir definitivamente (sem recuperação)',
    description:
      'Apagar DO SISTEMA autorizações (com trilha e PDF), documentos com todo o histórico e versões individuais — para erros que não podem aparecer a clientes/auditores. Nenhum papel recebe por padrão.',
  },
] as const;

export type UnitAction = (typeof unitActionCatalog)[number]['action'];
export const unitActions = unitActionCatalog.map((entry) => entry.action) as unknown as [
  UnitAction,
  ...UnitAction[],
];
export const unitActionGroups = [...new Set(unitActionCatalog.map((entry) => entry.group))];

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

// Prioridade da ação no plano (definida pelo usuário em 04/07/2026), derivada
// do peso da norma — o peso em si NUNCA aparece no front, só a prioridade.
// Fórmula do legado (normalizacao.ts): riscoBruto = (nota máx − nota) × peso,
// amplitude = peso máx 4 × nota máx 4 = 16. O percentual é o lado "score"
// (100 − risco%), e as faixas são: ❌ Alta 0–50% · ⚠️ Média 51–90% · ✅ Baixa 91–100%.
export const actionPriorities = ['alta', 'media', 'baixa'] as const;
export type ActionPriority = (typeof actionPriorities)[number];

export const actionPriorityLabels: Record<ActionPriority, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

export function actionPriority(
  importanceWeight: number,
  status: DiagnosticStatus,
): { percent: number; priority: ActionPriority } {
  const nota = diagnosticStatusScore[status] * 4;
  const risco = (4 - nota) * importanceWeight;
  const percent = Math.round((100 * (16 - risco)) / 16);
  const priority = percent <= 50 ? 'alta' : percent <= 90 ? 'media' : 'baixa';
  return { percent, priority };
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

// Nível de autorização NR-10 do colaborador (RF): Básico ou Básico + SEP.
// Guardado no metadata do colaborador (chave `nivel_autorizacao`); condiciona
// as colunas de treinamento SEP (só se aplicam a quem é Básico + SEP).
export const nivelAutorizacaoValues = ['basico', 'basico_sep'] as const;
export type NivelAutorizacao = (typeof nivelAutorizacaoValues)[number];
export const nivelAutorizacaoLabels: Record<NivelAutorizacao, string> = {
  basico: 'Básico',
  basico_sep: 'Básico + SEP',
};

// Campos default dos cadastros (definidos pelo sistema), POR GRUPO-ALVO —
// cada tipo de equipamento tem estrutura própria (decisão do usuário,
// 03/07/2026). kind 'document' = coluna vinculada a um documento do PIE
// (ex.: CA do EPI aponta para um Certificado de Aprovação; N itens podem
// apontar para o mesmo documento — base das automações de vencimento).
// kind 'select' = coluna com opções fixas (valor guardado no metadata).
// `code` (só document): mostra o input de código no editor + a coluna do
// código (ex.: nº do CA); documentos sem código só se vinculam pela lista.
// `requires`: a coluna só se aplica quando outro campo select tem o valor
// dado (ex.: treinamento SEP exige nivel_autorizacao = basico_sep).
// Valores texto vivem no metadata do item; vínculos em register_document_link.
export interface RegisterField {
  key: string;
  label: string;
  /** Rótulo curto só para o cabeçalho da tabela (nome completo vai no tooltip
   * e nos botões/diálogos) — evita colunas largas com rótulos longos. */
  shortLabel?: string;
  /** Nome do documento padrão no catálogo (RF11) para o auto-vínculo, quando
   * difere do `label` exibido (ex.: catálogo "Certificado Treinamento NR10
   * Básico" vs. label "Certificado de Treinamento NR10 Básico"). O match usa
   * label E defaultDocName, sem acento/caixa, tolerando o sufixo " - <item>". */
  defaultDocName?: string;
  kind?: 'document' | 'select';
  code?: boolean;
  options?: { value: string; label: string }[];
  requires?: { fieldKey: string; value: string };
}

const sepRequires = { fieldKey: 'nivel_autorizacao', value: 'basico_sep' } as const;

export const defaultRegisterFields: Record<RegisterTarget, RegisterField[]> = {
  colaboradores: [
    {
      key: 'nivel_autorizacao',
      label: 'Nível de autorização',
      shortLabel: 'Nível',
      kind: 'select',
      options: nivelAutorizacaoValues.map((value) => ({
        value,
        label: nivelAutorizacaoLabels[value],
      })),
    },
    {
      key: 'treinamento_nr10_basico',
      label: 'Certificado de Treinamento NR10 Básico',
      shortLabel: 'NR10 Básico',
      defaultDocName: 'Certificado Treinamento NR10 Básico',
      kind: 'document',
    },
    {
      key: 'treinamento_nr10_basico_reciclagem',
      label: 'Certificado de Treinamento NR10 Básico Reciclagem',
      shortLabel: 'NR10 Básico recic.',
      defaultDocName: 'Certificado Treinamento NR10 Básico Reciclagem',
      kind: 'document',
    },
    {
      key: 'treinamento_nr10_sep',
      label: 'Certificado de Treinamento NR10 SEP',
      shortLabel: 'NR10 SEP',
      defaultDocName: 'Certificado Treinamento NR10 SEP',
      kind: 'document',
      requires: sepRequires,
    },
    {
      key: 'treinamento_nr10_sep_reciclagem',
      label: 'Certificado de Treinamento NR10 SEP Reciclagem',
      shortLabel: 'NR10 SEP recic.',
      defaultDocName: 'Certificado Treinamento NR10 SEP Reciclagem',
      kind: 'document',
      requires: sepRequires,
    },
    {
      key: 'autorizacao_trabalho',
      label: 'Autorização de Trabalho',
      shortLabel: 'Autorização',
      defaultDocName: 'Autorização de Trabalho NR10',
      kind: 'document',
    },
  ],
  eletrico: [
    { key: 'identificacao', label: 'Identificação (TAG)', shortLabel: 'TAG' },
    { key: 'manual_tecnico', label: 'Manual Técnico', kind: 'document' },
    {
      key: 'certificado_calibracao',
      label: 'Certificado de Calibração',
      shortLabel: 'Cert. calibração',
      defaultDocName: 'Certificados de Calibração',
      kind: 'document',
    },
  ],
  ferramenta: [
    { key: 'numero_serie', label: 'Nº de série', shortLabel: 'Nº série' },
    {
      key: 'laudo_isolacao',
      label: 'Laudo e Teste de Isolação',
      shortLabel: 'Laudo isolação',
      kind: 'document',
    },
    {
      key: 'especificacao_tecnica',
      label: 'Especificação Técnica',
      shortLabel: 'Especificação',
      kind: 'document',
    },
  ],
  epi: [
    {
      key: 'ca',
      label: 'Certificado de Aprovação (CA)',
      shortLabel: 'CA',
      kind: 'document',
      code: true,
    },
    {
      key: 'laudo_isolacao',
      label: 'Laudo e Teste de Isolação',
      shortLabel: 'Laudo isolação',
      kind: 'document',
    },
    {
      key: 'especificacao_tecnica',
      label: 'Especificação Técnica',
      shortLabel: 'Especificação',
      kind: 'document',
    },
  ],
  epc: [
    {
      key: 'laudo_isolacao',
      label: 'Laudo e Teste de Isolação',
      shortLabel: 'Laudo isolação',
      kind: 'document',
    },
    {
      key: 'especificacao_tecnica',
      label: 'Especificação Técnica',
      shortLabel: 'Especificação',
      kind: 'document',
    },
  ],
};

// Chaves dos campos default guardados em COLUNA de verdade (não no metadata):
// selects, textos e o código de documentos com `code`. Documentos sem código
// não têm valor de texto (o vínculo vive em register_document_link). Os campos
// PERSONALIZADOS da unidade continuam no metadata do item.
export function columnFieldKeys(target: RegisterTarget): string[] {
  return defaultRegisterFields[target]
    .filter((field) => field.kind !== 'document' || field.code)
    .map((field) => field.key);
}

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

// Autorizações (módulo sob Cadastros): documentos gerados para a assinatura
// do colaborador — presencial (canvas na hora) ou por link público (colaborador
// sem acesso ao sistema). Assinado, vira PDF com trilha de auditoria na pasta
// do colaborador no P.I.E, vinculado à autorização.
export const authorizationTypes = ['permissao_trabalho', 'ficha_epi'] as const;
export type AuthorizationType = (typeof authorizationTypes)[number];

export const authorizationTypeLabels: Record<AuthorizationType, string> = {
  permissao_trabalho: 'Autorização de Trabalho',
  ficha_epi: 'Ficha de EPI',
};

export const authorizationStatuses = ['pendente', 'assinada', 'cancelada'] as const;
export type AuthorizationStatus = (typeof authorizationStatuses)[number];

export const authorizationStatusLabels: Record<AuthorizationStatus, string> = {
  pendente: 'Pendente',
  assinada: 'Assinada',
  cancelada: 'Cancelada',
};

// Trilha de auditoria (RNF de rastreabilidade): eventos imutáveis por
// autorização, impressos na ficha final do PDF.
export const authorizationEventTypes = ['criada', 'assinada', 'concluida', 'cancelada'] as const;
export type AuthorizationEventType = (typeof authorizationEventTypes)[number];

export const authorizationEventLabels: Record<AuthorizationEventType, string> = {
  criada: 'Criada',
  assinada: 'Assinada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

// Conteúdo por tipo (jsonb `details`): o essencial de cada documento.
// `atividades` guarda o NOME (snapshot) das atividades marcadas na lista
// cadastrada — não o id, para o documento assinado sobreviver a uma
// atividade renomeada/excluída depois.
export interface WorkPermitDetails {
  atividades: string[];
  local?: string;
  validade?: string; // YYYY-MM-DD
}

export interface EpiSheetDetails {
  epis: { nome: string; ca?: string }[];
}

export type AuthorizationDetails = WorkPermitDetails | EpiSheetDetails;

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
