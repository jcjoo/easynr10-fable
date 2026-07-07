import { useRef, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { Button } from './button';

// Campo de logo (empresa/unidade): preview + trocar/remover. O upload em si
// (presigned PUT + gravação da key) é do chamador — aqui só a UI e a
// validação do tipo de arquivo.

const accepted = ['image/png', 'image/jpeg', 'image/webp'];

export function LogoField({
  url,
  busy,
  onSelect,
  onRemove,
}: {
  url: string | null | undefined;
  busy?: boolean;
  onSelect: (file: File) => void;
  onRemove?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-4">
      {url ? (
        <img
          src={url}
          alt="Logo"
          className="size-16 shrink-0 rounded-card border border-line bg-surface object-contain p-1"
        />
      ) : (
        <span className="grid size-16 shrink-0 place-items-center rounded-card bg-idle-soft text-idle">
          <ImageIcon aria-hidden className="size-7" />
        </span>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="font-ui text-sm font-semibold">Logo</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? 'Enviando…' : url ? 'Trocar logo' : 'Adicionar logo'}
          </Button>
          {url && onRemove && (
            <Button type="button" variant="secondary" disabled={busy} onClick={onRemove}>
              Remover
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={accepted.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (!accepted.includes(file.type)) {
            setError('Use PNG, JPEG ou WebP.');
            return;
          }
          setError(null);
          onSelect(file);
        }}
      />
    </div>
  );
}
