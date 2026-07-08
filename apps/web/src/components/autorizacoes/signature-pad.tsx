import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
// Fontes cursivas empacotadas (OFL) — a assinatura digitada não pode depender
// das fontes do sistema (o PNG precisa sair igual em qualquer dispositivo).
import '@fontsource/great-vibes/400.css';
import '@fontsource/caveat/400.css';

// Pad de assinatura usado na assinatura presencial (dialog) e na página
// pública /assinar. Dois modos, como Google Docs/D4Sign: desenhar no canvas
// ou DIGITAR o nome e escolher um estilo cursivo — ambos viram o mesmo PNG
// (data URL) embutido no PDF. Fundo sempre claro: o traço preto precisa ser
// legível também no tema escuro.

const INK = '#1a1d21';

const signatureStyles = [
  { id: 'elegante', label: 'Elegante', family: 'Great Vibes', size: 58 },
  { id: 'manuscrita', label: 'Manuscrita', family: 'Caveat', size: 62 },
] as const;
type SignatureStyle = (typeof signatureStyles)[number];

// Nome → PNG na fonte escolhida (canvas offscreen, 2x para nitidez).
async function typedSignature(name: string, style: SignatureStyle) {
  await document.fonts.load(`${style.size}px "${style.family}"`, name);
  const scale = 2;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = `${style.size}px "${style.family}"`;
  const width = Math.ceil(probe.measureText(name).width) + 48;
  const height = style.size * 2;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.font = `${style.size}px "${style.family}"`;
  ctx.fillStyle = INK;
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 24, height / 2);
  return canvas.toDataURL('image/png');
}

function DrawPad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  // Bitmap na densidade do dispositivo (traço nítido em telas retina); o
  // tamanho CSS vem do layout.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * scale;
    canvas.height = canvas.clientHeight * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const ctx = event.currentTarget.getContext('2d')!;
    const { x, y } = point(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Um toque sem arrastar ainda marca um ponto.
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext('2d')!;
    const { x, y } = point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    setEmpty(false);
    onChange(event.currentTarget.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setEmpty(true);
    onChange(null);
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="h-40 w-full touch-none rounded-ctl border border-dashed border-line-strong bg-white"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">Assine dentro do quadro (dedo, caneta ou mouse).</span>
        <button
          type="button"
          onClick={clear}
          disabled={empty}
          className="inline-flex cursor-pointer items-center gap-1 font-ui text-label font-medium
            text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Eraser aria-hidden className="size-3.5" /> Limpar
        </button>
      </div>
    </>
  );
}

function TypePad({
  signerName,
  onChange,
}: {
  signerName: string;
  onChange: (dataUrl: string | null) => void;
}) {
  const [name, setName] = useState(signerName);
  const [styleId, setStyleId] = useState<SignatureStyle['id']>('elegante');

  // Nome+estilo → PNG; corrida entre gerações resolvida pelo flag `stale`.
  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      onChange(null);
      return;
    }
    let stale = false;
    const style = signatureStyles.find((s) => s.id === styleId)!;
    typedSignature(trimmed, style).then((dataUrl) => {
      if (!stale) onChange(dataUrl);
    });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, styleId]);

  return (
    <>
      <label className="flex flex-col gap-1.5 font-ui text-caption font-semibold">
        Nome de quem assina
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-[15px]
            font-normal text-ink focus-visible:border-action focus-visible:outline-2
            focus-visible:outline-action focus-visible:outline-offset-0"
        />
      </label>
      <div role="radiogroup" aria-label="Estilo da assinatura" className="grid grid-cols-2 gap-2">
        {signatureStyles.map((style) => (
          <button
            key={style.id}
            type="button"
            role="radio"
            aria-checked={styleId === style.id}
            onClick={() => setStyleId(style.id)}
            className={`flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-ctl
              border bg-white px-3 ${
                styleId === style.id
                  ? 'border-action outline-2 outline-action'
                  : 'border-line-strong hover:border-action'
              }`}
          >
            <span
              style={{ fontFamily: `"${style.family}", cursive` }}
              className="max-w-full truncate text-[28px] leading-none text-[#1a1d21]"
            >
              {name.trim() || 'Assinatura'}
            </span>
            <span className="font-ui text-label font-medium text-muted">{style.label}</span>
          </button>
        ))}
      </div>
      <span className="text-xs text-muted">
        A assinatura é gerada com o nome digitado, no estilo escolhido.
      </span>
    </>
  );
}

export function SignaturePad({
  signerName,
  onChange,
}: {
  /** Nome do colaborador — pré-preenche a assinatura digitada. */
  signerName: string;
  /** PNG (data URL) da assinatura; null enquanto vazia. */
  onChange: (dataUrl: string | null) => void;
}) {
  const [mode, setMode] = useState<'desenhar' | 'digitar'>('desenhar');

  // Trocar de modo zera a assinatura — o que vale é o que está visível.
  function switchMode(next: typeof mode) {
    if (next === mode) return;
    setMode(next);
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="font-ui text-caption font-semibold">Assinatura</span>
        <div role="tablist" className="flex rounded-ctl border border-line-strong p-0.5">
          {(['desenhar', 'digitar'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => switchMode(value)}
              className={`cursor-pointer rounded-[5px] px-2.5 py-1 font-ui text-label font-semibold
                ${mode === value ? 'bg-action-soft text-ink' : 'text-muted hover:text-ink'}`}
            >
              {value === 'desenhar' ? 'Desenhar' : 'Digitar'}
            </button>
          ))}
        </div>
      </div>
      {mode === 'desenhar' ? (
        // key força um canvas novo a cada volta ao modo desenhar.
        <DrawPad key={String(mode)} onChange={onChange} />
      ) : (
        <TypePad signerName={signerName} onChange={onChange} />
      )}
    </div>
  );
}
