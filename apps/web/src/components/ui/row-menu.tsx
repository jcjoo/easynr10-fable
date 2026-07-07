import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export interface MenuPosition {
  top: number;
  left?: number;
  right?: number;
}

// Menu flutuante em portal (não é cortado por containers com overflow).
// Usado pelo botão ⋯ e pelo menu de contexto (clique direito).
export function Menu({
  position,
  items,
  onClose,
}: {
  position: MenuPosition;
  items: MenuItem[];
  onClose: () => void;
}) {
  // Rolagem/resize invalidam a âncora — fecha o menu.
  useEffect(() => {
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return createPortal(
    <>
      <div
        aria-hidden
        className="fixed inset-0 z-40"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        role="menu"
        style={{ top: position.top, left: position.left, right: position.right }}
        className="fixed z-50 min-w-44 overflow-hidden rounded-card border border-line-strong bg-surface py-1 shadow-pop"
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
              item.onSelect();
            }}
            className={`block w-full cursor-pointer px-3.5 py-2 text-left font-ui text-caption font-medium hover:bg-paper ${
              item.danger ? 'text-bad' : 'text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}

// Botão ⋯ de linha de tabela.
export function RowMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  function toggle() {
    if (position) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className="cursor-pointer rounded-ctl p-1 text-muted hover:bg-paper hover:text-ink"
      >
        <MoreVertical aria-hidden className="size-4" />
      </button>
      {position && <Menu position={position} items={items} onClose={() => setPosition(null)} />}
    </>
  );
}
