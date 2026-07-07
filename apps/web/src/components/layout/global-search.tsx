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
  // Mobile: o campo não cabe no header (crumbs + tema); vira botão de lupa
  // que abre um painel de largura total sobre o topo da tela.
  const [mobileOpen, setMobileOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mobileOpen) inputRef.current?.focus();
  }, [mobileOpen]);

  const companies = useQuery(trpc.companies.list.queryOptions());
  const units = useQuery({
    ...trpc.units.listByCompany.queryOptions({ companyId: companyId ?? '' }),
    enabled: Boolean(companyId),
  });
  // Pastas e documentos do P.I.E da unidade ativa.
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
        setMobileOpen(false);
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
    <>
      {/* Lupa (só mobile): abre o painel de busca de largura total. */}
      {!mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir busca"
          className="shrink-0 cursor-pointer rounded-ctl p-1.5 text-ink-soft hover:bg-line/60 hover:text-ink sm:hidden"
        >
          <Search aria-hidden className="size-5" />
        </button>
      )}

      <div
        className={
          mobileOpen
            ? 'fixed inset-x-0 top-0 z-50 border-b border-line bg-paper p-2 sm:static sm:z-auto sm:w-full sm:max-w-sm sm:border-0 sm:bg-transparent sm:p-0'
            : 'hidden w-full max-w-sm sm:block'
        }
      >
        <div className="relative">
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
            onBlur={() =>
              setTimeout(() => {
                setOpen(false);
                setMobileOpen(false);
              }, 120)
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) select(results[0]);
            }}
            className="w-full rounded-ctl border border-line-strong bg-surface py-1.5 pl-8 pr-3 text-sm
              placeholder:text-muted focus-visible:border-action focus-visible:outline-2
              focus-visible:outline-action focus-visible:outline-offset-0 sm:pr-14"
          />
          {/* Atalho de teclado: irrelevante em touch, só aparece com espaço. */}
          <kbd
            aria-hidden
            className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-micro text-muted sm:block"
          >
            Ctrl K
          </kbd>

          {open && term.trim() && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-card border border-line bg-surface shadow-pop">
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
                        <span className="shrink-0 font-mono text-micro uppercase tracking-wide text-muted">
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
      </div>
    </>
  );
}
