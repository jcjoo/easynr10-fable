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
    <nav aria-label="Contexto" className="flex items-center gap-2 font-ui text-[13px]">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && (
              <span aria-hidden className="text-line-strong">
                /
              </span>
            )}
            {last || !item.to ? (
              <span className={last ? 'font-semibold text-ink' : 'text-muted'}>
                {item.label}
              </span>
            ) : (
              <Link
                to={item.to}
                params={item.params}
                className="text-muted hover:text-action hover:underline"
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
