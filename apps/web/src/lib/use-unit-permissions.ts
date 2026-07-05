import { useQuery } from '@tanstack/react-query';
import type { UnitAction } from '@easynr10/shared';
import { trpc } from './trpc';

// Permissões efetivas do usuário na unidade (papel do membership; admin =
// todas). A sidebar esconde módulos sem "*.ler" e as queries de layout
// (árvore do PIE, busca global, pickers) usam `can()` no enabled — senão um
// FORBIDDEN de módulo bloqueado derrubaria a página inteira para 403.
export function useUnitPermissions(unitId: string | null | undefined) {
  const query = useQuery({
    ...trpc.units.myPermissions.queryOptions({ unitId: unitId ?? '' }),
    enabled: Boolean(unitId),
    staleTime: 5 * 60_000,
  });
  const permissions = new Set(query.data ?? []);
  return {
    loaded: query.isSuccess,
    can: (action: UnitAction) => permissions.has(action),
    // Enquanto carrega, não esconder (evita flicker para quem tem acesso).
    canShow: (action: UnitAction) => !query.isSuccess || permissions.has(action),
  };
}
