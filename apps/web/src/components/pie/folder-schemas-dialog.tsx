import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CornerDownRight, Plus, Trash2 } from 'lucide-react';
import type { FolderSchemaNodeInput } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { AlertStrip } from '@/components/ui/alert-strip';
import { Field } from '@/components/ui/field';
import { SelectField } from '@/components/ui/select';
import { FolderIcon } from '@/components/ui/icons';

interface NodeDraft {
  key: string;
  name: string;
  children: NodeDraft[];
}

const toDraft = (nodes: FolderSchemaNodeInput[]): NodeDraft[] =>
  nodes.map((node) => ({
    key: crypto.randomUUID(),
    name: node.name,
    children: toDraft(node.children ?? []),
  }));

const toStructure = (nodes: NodeDraft[]): FolderSchemaNodeInput[] =>
  nodes
    .filter((node) => node.name.trim().length > 0)
    .map((node) => ({ name: node.name.trim(), children: toStructure(node.children) }));

const countNodes = (nodes: FolderSchemaNodeInput[]): number =>
  nodes.reduce((total, node) => total + 1 + countNodes(node.children ?? []), 0);

function TreePreview({ nodes, depth = 0 }: { nodes: FolderSchemaNodeInput[]; depth?: number }) {
  return (
    <ul className="flex flex-col gap-1">
      {nodes.map((node, index) => (
        <li key={`${depth}-${index}-${node.name}`}>
          <span
            className="flex items-center gap-2 text-sm"
            style={{ paddingLeft: depth * 18 }}
          >
            <FolderIcon aria-hidden className="size-4 shrink-0 text-muted" />
            {node.name}
          </span>
          {node.children && node.children.length > 0 && (
            <TreePreview nodes={node.children} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  );
}

function TreeEditor({
  nodes,
  onChange,
  depth = 0,
}: {
  nodes: NodeDraft[];
  onChange: (nodes: NodeDraft[]) => void;
  depth?: number;
}) {
  const update = (key: string, patch: Partial<NodeDraft>) =>
    onChange(nodes.map((node) => (node.key === key ? { ...node, ...patch } : node)));

  return (
    <ul className="flex flex-col gap-1.5">
      {nodes.map((node) => (
        <li key={node.key} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5" style={{ marginLeft: depth * 18 }}>
            {depth > 0 && <CornerDownRight aria-hidden className="size-3.5 shrink-0 text-muted" />}
            <input
              value={node.name}
              onChange={(e) => update(node.key, { name: e.target.value })}
              placeholder="Nome da pasta"
              aria-label="Nome da pasta"
              className="min-w-0 flex-1 rounded-ctl border border-line-strong bg-surface px-2 py-1.5 text-sm focus-visible:border-action focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-0"
            />
            <button
              type="button"
              title="Adicionar subpasta"
              onClick={() =>
                update(node.key, {
                  children: [...node.children, { key: crypto.randomUUID(), name: '', children: [] }],
                })
              }
              className="cursor-pointer rounded-ctl p-1.5 text-muted hover:bg-paper hover:text-action"
            >
              <Plus aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              title="Remover pasta"
              onClick={() => onChange(nodes.filter((item) => item.key !== node.key))}
              className="cursor-pointer rounded-ctl p-1.5 text-muted hover:bg-paper hover:text-bad"
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          </div>
          {node.children.length > 0 && (
            <TreeEditor
              nodes={node.children}
              onChange={(children) => update(node.key, { children })}
              depth={depth + 1}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

interface FolderSchemasDialogProps {
  open: boolean;
  onClose: () => void;
  unitId: string;
  /** Pasta atual do P.I.E — a estrutura é gerada a partir daqui. */
  currentFolderId: string | null;
  currentFolderName: string;
}

// Gerador de estruturas de pastas, fiel ao legado: selecionar/criar/editar
// estruturas da unidade e gerar a árvore a partir da pasta atual.
export function FolderSchemasDialog({
  open,
  onClose,
  unitId,
  currentFolderId,
  currentFolderName,
}: FolderSchemasDialogProps) {
  const queryClient = useQueryClient();
  const schemas = useQuery({
    ...trpc.folderSchemas.listByUnit.queryOptions({ unitId }),
    enabled: open,
  });

  const [mode, setMode] = useState<'select' | 'create' | 'edit'>('select');
  const [selectedId, setSelectedId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftNodes, setDraftNodes] = useState<NodeDraft[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode('select');
      setFeedback(null);
    }
  }, [open]);

  const selected = schemas.data?.find((item) => item.id === selectedId) ?? schemas.data?.[0];

  const invalidateSchemas = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.folderSchemas.listByUnit.queryKey({ unitId }),
    });

  const applySchema = useMutation(
    trpc.folderSchemas.applyToUnit.mutationOptions({
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: trpc.folders.list.queryKey({ unitId }) });
        setFeedback(
          result.created > 0
            ? `${result.created} pasta(s) criada(s) em "${currentFolderName}".`
            : 'Nenhuma pasta nova — a estrutura já existe neste nível.',
        );
      },
    }),
  );
  const createSchema = useMutation(
    trpc.folderSchemas.create.mutationOptions({
      onSuccess: (created) => {
        invalidateSchemas();
        if (created) setSelectedId(created.id);
        setMode('select');
      },
    }),
  );
  const updateSchema = useMutation(
    trpc.folderSchemas.update.mutationOptions({
      onSuccess: () => {
        invalidateSchemas();
        setMode('select');
      },
    }),
  );
  const removeSchema = useMutation(
    trpc.folderSchemas.remove.mutationOptions({
      onSuccess: () => {
        setSelectedId('');
        invalidateSchemas();
      },
    }),
  );

  function startCreate() {
    setDraftName('');
    setDraftNodes([{ key: crypto.randomUUID(), name: '', children: [] }]);
    setMode('create');
  }

  function startEdit() {
    if (!selected) return;
    setDraftName(selected.name);
    setDraftNodes(toDraft(selected.structure));
    setMode('edit');
  }

  function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    const structure = toStructure(draftNodes);
    if (!draftName.trim() || structure.length === 0) return;
    if (mode === 'create') {
      createSchema.mutate({ unitId, name: draftName.trim(), structure });
    } else if (selected) {
      updateSchema.mutate({
        unitId,
        schemaId: selected.id,
        name: draftName.trim(),
        structure,
      });
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'select' ? 'Estruturas de pastas' : mode === 'create' ? 'Nova estrutura' : 'Editar estrutura'}
      footer={
        mode === 'select' ? (
          <>
            <Button type="button" variant="ghost" className="mr-auto" onClick={startCreate}>
              <Plus aria-hidden className="size-4" /> Nova estrutura
            </Button>
            {selected && (
              <>
                <Button
                  type="button"
                  variant="danger"
                  disabled={removeSchema.isPending}
                  onClick={() => removeSchema.mutate({ unitId, schemaId: selected.id })}
                >
                  Excluir estrutura
                </Button>
                <Button type="button" variant="secondary" onClick={startEdit}>
                  Editar
                </Button>
                <Button
                  type="button"
                  disabled={applySchema.isPending}
                  onClick={() =>
                    applySchema.mutate({
                      unitId,
                      schemaId: selected.id,
                      parentId: currentFolderId,
                    })
                  }
                >
                  {applySchema.isPending ? 'Gerando…' : `Gerar em "${currentFolderName}"`}
                </Button>
              </>
            )}
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={() => setMode('select')}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="folder-schema-form"
              disabled={createSchema.isPending || updateSchema.isPending}
            >
              {mode === 'create' ? 'Criar estrutura' : 'Salvar alterações'}
            </Button>
          </>
        )
      }
    >
      {mode === 'select' ? (
        <div className="flex flex-col gap-4">
          {schemas.data?.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma estrutura cadastrada nesta unidade.</p>
          ) : (
            <>
              <SelectField
                label="Estrutura"
                value={selected?.id ?? ''}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {schemas.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectField>

              {selected && (
                <div className="rounded-card border border-line bg-paper p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-ui text-xs font-semibold uppercase tracking-[.06em] text-muted">
                      Estrutura · {countNodes(selected.structure)} pasta(s)
                    </span>
                  </div>
                  <TreePreview nodes={selected.structure} />
                </div>
              )}
            </>
          )}

          {feedback && <p className="text-sm text-ok">{feedback}</p>}
          {(applySchema.error || removeSchema.error) && (
            <AlertStrip>{applySchema.error?.message ?? removeSchema.error?.message}</AlertStrip>
          )}
        </div>
      ) : (
        <form id="folder-schema-form" onSubmit={saveDraft} className="flex flex-col gap-4">
          <Field
            label="Nome da estrutura"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Ex.: Prontuário completo"
            autoFocus
          />
          <div className="flex flex-col gap-2">
            <span className="font-ui text-caption font-semibold">Pastas</span>
            <TreeEditor nodes={draftNodes} onChange={setDraftNodes} />
            <Button
              type="button"
              variant="ghost"
              className="self-start"
              onClick={() =>
                setDraftNodes([...draftNodes, { key: crypto.randomUUID(), name: '', children: [] }])
              }
            >
              <Plus aria-hidden className="size-4" /> Adicionar pasta na raiz
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
