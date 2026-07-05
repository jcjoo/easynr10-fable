import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useUnitPermissions } from '@/lib/use-unit-permissions';
import { useActiveContext } from '@/stores/active-context';

interface Result {
  key: string;
  kind: 'Empresa' | 'Unidade' | 'Pasta' | 'Documento';
  name: string;
  go: () => void;
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const { companyId, unitId } = useActiveContext();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const companies = useQuery(trpc.companies.list.queryOptions());
  const units = useQuery({
    ...trpc.units.listByCompany.queryOptions({ companyId: companyId ?? '' }),
    enabled: Boolean(companyId),
  });
  // Pastas e documentos do PIE da unidade ativa.
  const { can } = useUnitPermissions(unitId);
  const folders = useQuery({
    ...trpc.folders.list.queryOptions({ unitId: unitId ?? '' }),
    enabled: Boolean(unitId) && can('pie.ler'),
  });
  const documents = useQuery({
    ...trpc.documents.listBySubtree.queryOptions({ unitId: unitId ?? '', folderId: null }),
    enabled: Boolean(unitId) && can('pie.ler'),
  });

  // Ctrl/Cmd+K foca a busca de qualquer lugar.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const results = useMemo<Result[]>(() => {
    const query = term.trim().toLowerCase();
    if (!query) return [];
    const fromCompanies: Result[] = (companies.data ?? [])
      .filter((company) => company.name.toLowerCase().includes(query))
      .map((company) => ({
        key: `c-${company.id}`,
        kind: 'Empresa',
        name: company.name,
        go: () => navigate({ to: '/$companyId', params: { companyId: company.id } }),
      }));
    const fromUnits: Result[] = (companyId ? (units.data ?? []) : [])
      .filter((unit) => unit.name.toLowerCase().includes(query))
      .map((unit) => ({
        key: `u-${unit.id}`,
        kind: 'Unidade',
        name: unit.name,
        go: () =>
          navigate({
            to: '/$companyId/$unitId',
            params: { companyId: companyId!, unitId: unit.id },
          }),
      }));
    const inUnit = companyId && unitId;
    const fromFolders: Result[] = (inUnit ? (folders.data ?? []) : [])
      .filter((folder) => folder.name.toLowerCase().includes(query))
      .map((folder) => ({
        key: `f-${folder.id}`,
        kind: 'Pasta',
        name: folder.name,
        go: () =>
          navigate({
            to: '/$companyId/$unitId/pie',
            params: { companyId: companyId!, unitId: unitId! },
            search: { pasta: folder.id },
          }),
      }));
    const fromDocuments: Result[] = (inUnit ? (documents.data ?? []) : [])
      .filter((doc) => doc.name.toLowerCase().includes(query))
      .map((doc) => ({
        key: `d-${doc.id}`,
        kind: 'Documento',
        name: doc.name,
        go: () =>
          navigate({
            to: '/$companyId/$unitId/pie',
            params: { companyId: companyId!, unitId: unitId! },
            search: { pasta: doc.folderId },
          }),
      }));
    return [...fromFolders, ...fromDocuments, ...fromUnits, ...fromCompanies].slice(0, 10);
  }, [term, companies.data, units.data, folders.data, documents.data, companyId, unitId, navigate]);

  function select(result: Result) {
    result.go();
    setTerm('');
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div className="relative w-full max-w-sm">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-label="Buscar empresas, unidades, pastas e documentos"
        placeholder="Buscar…"
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) select(results[0]);
        }}
        className="w-full rounded-ctl border border-line-strong bg-surface py-1.5 pl-8 pr-14 text-sm
          placeholder:text-muted focus-visible:border-action focus-visible:outline-2
          focus-visible:outline-action focus-visible:outline-offset-0"
      />
      <kbd
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[10.5px] text-muted"
      >
        Ctrl K
      </kbd>

      {open && term.trim() && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-card border border-line bg-surface shadow-[0_8px_24px_rgba(26,35,51,.14)]">
          {results.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted">
              Nada encontrado para "{term.trim()}".
            </p>
          ) : (
            <ul>
              {results.map((result) => (
                <li key={result.key}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => select(result)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-action-soft"
                  >
                    <span className="truncate font-medium">{result.name}</span>
                    <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted">
                      {result.kind}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
