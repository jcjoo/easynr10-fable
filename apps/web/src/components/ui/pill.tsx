// Pill de status (leitura, não clicável): corpo único do sistema — ponto na
// cor do texto + rótulo. A semântica vem do par de classes `text-X bg-X-soft`.
export function Pill({
  label,
  className,
  title,
}: {
  label: string;
  className: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5
        font-ui text-label font-semibold ${className}`}
    >
      <span aria-hidden className="size-[7px] rounded-full bg-current" />
      {label}
    </span>
  );
}
