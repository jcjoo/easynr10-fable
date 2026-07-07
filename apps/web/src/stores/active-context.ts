import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Contexto ativo (empresa/unidade) espelhado da URL — a URL é a fonte da
// verdade. Rotas SEM params (/, /empresas, /configuracoes) limpam o contexto
// no AuthedLayout: manter a última empresa/unidade na sidebar confundia.
interface ActiveContextState {
  companyId: string | null;
  unitId: string | null;
  setCompany: (companyId: string) => void;
  setUnit: (companyId: string, unitId: string) => void;
  clear: () => void;
}

export const useActiveContext = create<ActiveContextState>()(
  persist(
    (set) => ({
      companyId: null,
      unitId: null,
      // Rota de empresa (sem unidade nos params) desmarca a unidade — ir
      // para "Unidades" ou o painel da empresa é SAIR da unidade atual.
      setCompany: (companyId) => set({ companyId, unitId: null }),
      setUnit: (companyId, unitId) => set({ companyId, unitId }),
      clear: () => set({ companyId: null, unitId: null }),
    }),
    { name: 'easynr10.active-context' },
  ),
);
