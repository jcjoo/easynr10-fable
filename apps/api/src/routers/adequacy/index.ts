import { router } from '../../trpc';
import { actionProcedures } from './actions';
import { diagnosticProcedures } from './diagnostics';
import { itemProcedures } from './items';
import { requirementProcedures } from './requirements';

// Router de adequação composto por módulos de responsabilidade única:
// itens (catálogo/config), requisitos de evidência, diagnósticos e plano
// de ação. O namespace tRPC (`adequacy.*`) não muda para o cliente.
export const adequacyRouter = router({
  ...itemProcedures,
  ...requirementProcedures,
  ...diagnosticProcedures,
  ...actionProcedures,
});
