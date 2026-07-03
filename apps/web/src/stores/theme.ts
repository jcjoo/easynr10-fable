import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: systemPrefersDark() ? 'dark' : 'light',
      toggle: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
    }),
    { name: 'easynr10.theme' },
  ),
);

// Aplica a classe .dark no <html> na carga e a cada mudança —
// vale para toda a árvore, inclusive a tela de login.
export function initTheme() {
  const apply = (theme: Theme) =>
    document.documentElement.classList.toggle('dark', theme === 'dark');
  apply(useTheme.getState().theme);
  useTheme.subscribe((state) => apply(state.theme));
}
