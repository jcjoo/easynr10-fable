// Fluxo de assinatura das autorizações (Autorização de Trabalho / Ficha de EPI):
// assinou (presencial ou link público) → PDF com trilha de auditoria via
// Gotenberg → objeto no S3 → documento na pasta do colaborador no P.I.E,
// vinculado à autorização (document_id).
export * from './find';
export * from './render';
export * from './sign';
