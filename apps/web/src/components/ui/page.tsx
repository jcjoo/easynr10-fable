import type { HTMLAttributes } from 'react';

// Container padrão de página: ocupa toda a largura do <main>, com o mesmo
// respiro em todas as telas. Antes cada página definia um max-w próprio
// (4xl/5xl/6xl), o que variava a largura entre páginas e monitores.
export function Page({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`w-full space-y-6 p-4 sm:p-6 ${className}`} {...props} />;
}

// Título padrão de página (h1) — o papel visual definido UMA vez; antes cada
// página repetia text-[28px] font-bold tracking-tight.
export function PageTitle({ className = '', ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={`text-title font-bold tracking-tight ${className}`} {...props} />;
}
