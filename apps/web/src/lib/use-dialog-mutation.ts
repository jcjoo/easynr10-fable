import { useState } from 'react';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';

// O trio repetido das páginas de CRUD — [alvo do diálogo, setAlvo] +
// useMutation cujo onSuccess fecha o diálogo e invalida queries — vira dois
// hooks componíveis:
//
//   const rename = useDialogTarget<FolderNode>();
//   const renameFolder = useDialogMutation(trpc.folders.rename.mutationOptions(), () => {
//     rename.close();
//     invalidateFolders();
//   });

// Estado de um diálogo cujo conteúdo é o registro-alvo (null = fechado).
export function useDialogTarget<T>() {
  const [target, setTarget] = useState<T | null>(null);
  return {
    target,
    isOpen: target !== null,
    open: (next: T) => setTarget(next),
    close: () => setTarget(null),
  };
}

// useMutation com um passo pós-sucesso (fechar diálogo, invalidar queries)
// componível por fora — os tipos do tRPC seguem inferidos.
export function useDialogMutation<TData, TError, TVariables, TContext>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
  onDone: () => void,
) {
  return useMutation({
    ...options,
    onSuccess: (...args: Parameters<NonNullable<typeof options.onSuccess>>) => {
      onDone();
      return options.onSuccess?.(...args);
    },
  });
}
