import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Menu, type MenuPosition } from '@/components/ui/row-menu';
import { FolderPickerDialog, type PickedFolder } from '@/components/pie/folder-picker';
import { UploadDocumentDialog } from '@/components/pie/upload-document-dialog';
import { ItemPickerDialog } from '@/components/diagnostico/item-picker';
import {
  AssessmentDialog,
  type AssessmentTarget,
} from '@/components/diagnostico/assessment-dialog';

// Botão "Novo" (estilo drive): atalhos de criação da unidade ativa, todos em
// modal — documento e pasta navegam até a pasta de destino; diagnóstico
// escolhe o item da norma e abre a avaliação. Colaborador/equipamento
// navegam com ?novo=1 (a tela abre o editor).
export function NewMenu({ companyId, unitId }: { companyId: string; unitId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  // Só oferece atalhos que o papel do usuário permite executar.
  const { can, loaded } = useUnitPermissions(unitId);
  const allow = (action: Parameters<typeof can>[0]) => !loaded || can(action);
  // Papel sem NENHUMA escrita: o botão "Novo" some (o menu ficaria vazio).
  const hasAnyShortcut =
    allow('pie.pasta.criar') ||
    allow('pie.documento.enviar') ||
    allow('diagnostico.avaliar') ||
    allow('cadastros.itens') ||
    allow('autorizacoes.gerar');

  // — Adicionar documentos: escolhe a pasta → upload nela —
  const [pickingDocFolder, setPickingDocFolder] = useState(false);
  const [uploadFolder, setUploadFolder] = useState<PickedFolder | null>(null);

  // — Criar pasta: escolhe o destino → nomeia —
  const [pickingParent, setPickingParent] = useState(false);
  const [newFolderParent, setNewFolderParent] = useState<PickedFolder | null>(null);
  const [folderName, setFolderName] = useState('');
  const createFolder = useMutation(
    trpc.folders.create.mutationOptions({
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({ queryKey: trpc.folders.list.queryKey({ unitId }) });
        setNewFolderParent(null);
        setFolderName('');
        navigate({
          to: '/$companyId/$unitId/pie',
          params: { companyId, unitId },
          search: variables.parentId ? { pasta: variables.parentId } : {},
        });
      },
    }),
  );

  // — Criar diagnóstico: escolhe o item → avaliação —
  const [pickingItem, setPickingItem] = useState(false);
  const [assessmentTarget, setAssessmentTarget] = useState<AssessmentTarget | null>(null);

  const goToUploadFolder = (folder: PickedFolder) => {
    setUploadFolder(folder);
    if (folder.id) {
      navigate({
        to: '/$companyId/$unitId/pie',
        params: { companyId, unitId },
        search: { pasta: folder.id },
      });
    }
  };

  if (!hasAnyShortcut) return null;

  return (
    <div className="px-3 pt-1">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        onClick={() => {
          if (position) return setPosition(null);
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) setPosition({ top: rect.bottom + 6, left: rect.left });
        }}
        className="flex w-fit cursor-pointer items-center gap-2 rounded-card border border-line-strong bg-surface py-2 pl-3.5 pr-5 font-ui text-sm font-semibold shadow-sm hover:border-ink-soft"
      >
        <Plus aria-hidden className="size-4 text-action" /> Novo
      </button>
      {position && (
        <Menu
          position={position}
          onClose={() => setPosition(null)}
          items={[
            ...(allow('pie.pasta.criar')
              ? [{ label: 'Criar pasta', onSelect: () => setPickingParent(true) }]
              : []),
            ...(allow('pie.documento.enviar')
              ? [{ label: 'Adicionar documentos', onSelect: () => setPickingDocFolder(true) }]
              : []),
            ...(allow('diagnostico.avaliar')
              ? [{ label: 'Criar diagnóstico', onSelect: () => setPickingItem(true) }]
              : []),
            ...(allow('cadastros.itens')
              ? [
                  {
                    label: 'Novo colaborador',
                    onSelect: () =>
                      navigate({
                        to: '/$companyId/$unitId/colaboradores',
                        params: { companyId, unitId },
                        search: { novo: '1' },
                      }),
                  },
                  {
                    label: 'Novo equipamento',
                    onSelect: () =>
                      navigate({
                        to: '/$companyId/$unitId/equipamentos',
                        params: { companyId, unitId },
                        search: { novo: '1' },
                      }),
                  },
                ]
              : []),
            ...(allow('autorizacoes.gerar')
              ? [
                  {
                    label: 'Nova autorização de trabalho',
                    onSelect: () =>
                      navigate({
                        to: '/$companyId/$unitId/autorizacoes',
                        params: { companyId, unitId },
                        search: { novo: '1', tipo: 'permissao-trabalho' },
                      }),
                  },
                  {
                    label: 'Nova ficha de EPI',
                    onSelect: () =>
                      navigate({
                        to: '/$companyId/$unitId/autorizacoes',
                        params: { companyId, unitId },
                        search: { novo: '1', tipo: 'ficha-epi' },
                      }),
                  },
                ]
              : []),
          ]}
        />
      )}

      {/* Adicionar documentos */}
      <FolderPickerDialog
        unitId={unitId}
        open={pickingDocFolder}
        onClose={() => setPickingDocFolder(false)}
        onSelect={goToUploadFolder}
        title="Adicionar documentos — escolha a pasta"
        confirmLabel="Enviar aqui"
      />
      {uploadFolder?.id && (
        <UploadDocumentDialog
          open
          onClose={() => setUploadFolder(null)}
          unitId={unitId}
          folderId={uploadFolder.id}
        />
      )}

      {/* Criar pasta */}
      <FolderPickerDialog
        unitId={unitId}
        open={pickingParent}
        onClose={() => setPickingParent(false)}
        onSelect={setNewFolderParent}
        title="Criar pasta — escolha o destino"
        confirmLabel="Criar aqui"
        allowRoot
      />
      <Dialog
        open={Boolean(newFolderParent)}
        onClose={() => setNewFolderParent(null)}
        title={`Nova pasta em ${newFolderParent?.name ?? ''}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newFolderParent || !folderName.trim()) return;
            createFolder.mutate({
              unitId,
              parentId: newFolderParent.id,
              name: folderName.trim(),
            });
          }}
          className="flex flex-col gap-4"
        >
          <Field
            label="Nome da pasta"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            autoFocus
          />
          {createFolder.error && (
            <p role="alert" className="text-sm text-bad">
              {createFolder.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setNewFolderParent(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!folderName.trim() || createFolder.isPending}>
              {createFolder.isPending ? 'Criando…' : 'Criar pasta'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Criar diagnóstico */}
      <ItemPickerDialog
        unitId={unitId}
        open={pickingItem}
        onClose={() => setPickingItem(false)}
        onSelect={setAssessmentTarget}
      />
      {assessmentTarget && (
        <AssessmentDialog
          key={assessmentTarget.id}
          unitId={unitId}
          target={assessmentTarget}
          onClose={() => setAssessmentTarget(null)}
          onSaved={() =>
            queryClient.invalidateQueries({ queryKey: trpc.adequacy.list.queryKey({ unitId }) })
          }
        />
      )}
    </div>
  );
}
