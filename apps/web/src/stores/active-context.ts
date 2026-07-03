import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Contexto ativo (empresa/unidade) espelhado da URL — a URL é a fonte da
// verdade; o store só mantém o contexto visível na sidebar ao navegar para
// rotas sem params (ex.: /empresas). Mesmo contrato do client-test.
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
      // Trocar de empresa só mantém a unidade se ela já pertencer à empresa.
      setCompany: (companyId) =>
        set((state) => ({
          companyId,
          unitId: state.companyId === companyId ? state.unitId : null,
        })),
      setUnit: (companyId, unitId) => set({ companyId, unitId }),
      clear: () => set({ companyId: null, unitId: null }),
    }),
    { name: 'easynr10.active-context' },
  ),
);
