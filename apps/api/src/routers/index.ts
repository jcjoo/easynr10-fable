import { router } from '../trpc';
import { companiesRouter } from './companies';
import { unitsRouter } from './units';
import { foldersRouter } from './folders';
import { folderSchemasRouter } from './folder-schemas';
import { documentsRouter } from './documents';
import { defaultDocumentsRouter } from './default-documents';
import { adequacyRouter } from './adequacy';
import { usersRouter } from './users';
import { registersRouter } from './registers';

export const appRouter = router({
  companies: companiesRouter,
  units: unitsRouter,
  folders: foldersRouter,
  folderSchemas: folderSchemasRouter,
  documents: documentsRouter,
  defaultDocuments: defaultDocumentsRouter,
  adequacy: adequacyRouter,
  users: usersRouter,
  registers: registersRouter,
});

export type AppRouter = typeof appRouter;
