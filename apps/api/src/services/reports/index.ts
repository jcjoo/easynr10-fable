// Camada de dados dos relatórios/dashboards (RF19–RF22) — consumida pelo
// router tRPC (telas) E pela rota HTTP de exportação; nenhum dos dois conhece
// SQL, só este serviço. Um arquivo por relatório.
export * from './actions';
export * from './adequacy';
export * from './documents';
export * from './overview';
export * from './timeline';
