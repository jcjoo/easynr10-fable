import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { registerTargetLabels, type EquipmentType, type RegisterField } from '@easynr10/shared';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { SelectField } from '@/components/ui/select';

// Importação de cadastros por planilha (.xlsx/.csv lidos no cliente via
// SheetJS): de-para de colunas com auto-match por nome normalizado e upsert
// por nome no servidor. Os campos importáveis vêm da página (default +
// personalizados, incluindo o código dos kind=document).

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

export function ImportDialog({
  open,
  onClose,
  unitId,
  isEmployees,
  equipmentTab,
  fields,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  unitId: string;
  isEmployees: boolean;
  equipmentTab: EquipmentType;
  fields: RegisterField[];
  onImported: () => void;
}) {
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sheetRows, setSheetRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [importResult, setImportResult] = useState<string | null>(null);

  const mappableFields = [{ key: '__name', label: 'Nome' }, ...fields];

  async function loadSheet(file: File) {
    // codepage 65001 = UTF-8 (CSVs sem BOM viravam mojibake).
    const workbook = XLSX.read(await file.arrayBuffer(), { raw: false, codepage: 65001 });
    const sheet = workbook.Sheets[workbook.SheetNames[0]!];
    const grid: string[][] = sheet
      ? XLSX.utils
          .sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
          .map((row) => row.map((cell) => String(cell ?? '').trim()))
      : [];
    const headers = (grid[0] ?? []).map(String);
    setSheetHeaders(headers);
    setSheetRows(grid.slice(1).filter((row) => row.some((cell) => cell)));
    // De-para automático por nome normalizado.
    const auto: Record<string, number> = {};
    for (const field of mappableFields) {
      const wanted = normalize(field.label);
      const index = headers.findIndex(
        (header) => normalize(header) === wanted || normalize(header).includes(wanted),
      );
      if (index >= 0) auto[field.key] = index;
    }
    setMapping(auto);
    setImportResult(null);
  }

  const importEmployees = useMutation(
    trpc.registers.importEmployees.mutationOptions({
      onSuccess: (result) => {
        setImportResult(`${result.created} criado(s), ${result.updated} atualizado(s).`);
        onImported();
      },
    }),
  );
  const importEquipment = useMutation(
    trpc.registers.importEquipment.mutationOptions({
      onSuccess: (result) => {
        setImportResult(`${result.created} criado(s), ${result.updated} atualizado(s).`);
        onImported();
      },
    }),
  );
  const importing = importEmployees.isPending || importEquipment.isPending;

  function runImport() {
    const nameIndex = mapping['__name'];
    if (nameIndex === undefined) return;
    const items = sheetRows
      .map((row) => ({
        name: row[nameIndex] ?? '',
        metadata: Object.fromEntries(
          fields
            .filter((field) => mapping[field.key] !== undefined)
            .map((field) => [field.key, row[mapping[field.key]!] ?? ''])
            .filter(([, value]) => value),
        ),
      }))
      .filter((item) => item.name);
    if (items.length === 0) return;
    if (isEmployees) importEmployees.mutate({ unitId, items });
    else importEquipment.mutate({ unitId, type: equipmentTab, items });
  }

  function handleClose() {
    setSheetHeaders([]);
    setSheetRows([]);
    setImportResult(null);
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Importar planilha">
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
        <p className="text-sm text-muted">
          Envie um arquivo .xlsx ou .csv com cabeçalho na primeira linha e faça o de-para das
          colunas. Itens com nome já existente são atualizados.
          {!isEmployees && (
            <>
              {' '}
              Os itens entram como <strong>{registerTargetLabels[equipmentTab]}</strong> (aba
              selecionada).
            </>
          )}
        </p>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          aria-label="Arquivo da planilha"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadSheet(file);
          }}
          className="rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded-ctl file:border-0 file:bg-action-soft file:px-3 file:py-1 file:font-ui file:text-caption file:font-semibold file:text-action"
        />

        {sheetHeaders.length > 0 && (
          <>
            <p className="text-sm">
              <strong>{sheetRows.length}</strong> linha(s) encontradas. Mapeie as colunas:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {mappableFields.map((field) => (
                <SelectField
                  key={field.key}
                  label={`${field.label}${field.key === '__name' ? ' (obrigatório)' : ''}`}
                  value={mapping[field.key] !== undefined ? String(mapping[field.key]) : ''}
                  onChange={(e) =>
                    setMapping((state) => {
                      const next = { ...state };
                      if (e.target.value === '') delete next[field.key];
                      else next[field.key] = Number(e.target.value);
                      return next;
                    })
                  }
                >
                  <option value="">Ignorar</option>
                  {sheetHeaders.map((header, index) => (
                    <option key={`${header}-${index}`} value={index}>
                      {header || `Coluna ${index + 1}`}
                    </option>
                  ))}
                </SelectField>
              ))}
            </div>
          </>
        )}

        {importResult && <p className="text-sm font-medium text-ok">{importResult}</p>}
        {(importEmployees.error || importEquipment.error) && (
          <p role="alert" className="text-sm text-bad">
            {importEmployees.error?.message ?? importEquipment.error?.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Fechar
          </Button>
          <Button
            type="button"
            disabled={mapping['__name'] === undefined || sheetRows.length === 0 || importing}
            onClick={runImport}
          >
            {importing ? 'Importando…' : 'Importar'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
