import { Link } from '@tanstack/react-router';
import { Fragment } from 'react';

export interface Crumb {
  label: string;
  to?: string;
  params?: Record<string, string>;
}

// Contexto empresa → unidade do guia: último item é a página atual.
export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    // min-w-0 + truncate: em telas estreitas cada nível encolhe em vez de
    // empurrar a busca/tema para fora do header.
    <nav aria-label="Contexto" className="flex min-w-0 items-center gap-2 font-ui text-[13px]">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && (
              <span aria-hidden className="shrink-0 text-line-strong">
                /
              </span>
            )}
            {last || !item.to ? (
              <span
                className={`min-w-0 truncate ${last ? 'font-semibold text-ink' : 'text-muted'}`}
              >
                {item.label}
              </span>
            ) : (
              <Link
                to={item.to}
                params={item.params}
                className="min-w-0 truncate text-muted hover:text-action hover:underline"
              >
                {item.label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
