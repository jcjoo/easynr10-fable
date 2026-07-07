import { useEffect, useMemo, useRef, useState } from 'react';
import type { TimelineInterval } from '@easynr10/shared';

// Evolução da aderência (%) no tempo — série única, linha 2px + wash de área,
// crosshair com tooltip (pointer e setas do teclado). Sem lib de gráfico.

export interface TimelinePoint {
  date: string; // YYYY-MM-DD
  percent: number | null; // null = nada avaliado até a data
  evaluated: number;
}

const HEIGHT = 220;
const PAD = { top: 14, right: 48, bottom: 26, left: 38 };

function formatTick(date: string, interval: TimelineInterval) {
  const [year, month, day] = date.split('-');
  if (interval === 'monthly') {
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${months[Number(month) - 1]}/${year!.slice(2)}`;
  }
  return `${day}/${month}`;
}

function formatFull(date: string) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export function AdherenceTimeline({
  points,
  interval,
}: {
  points: TimelinePoint[];
  interval: TimelineInterval;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const plotW = Math.max(width - PAD.left - PAD.right, 0);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) =>
    PAD.left + (points.length > 1 ? (index / (points.length - 1)) * plotW : plotW / 2);
  const y = (percent: number) => PAD.top + (1 - percent / 100) * plotH;

  // Segmentos contínuos (quebra nos nulls do início do histórico).
  const { linePath, areaPath, lastIndex } = useMemo(() => {
    let line = '';
    let area = '';
    let last = -1;
    let open = false;
    let segmentStart = -1;
    points.forEach((point, index) => {
      if (point.percent === null) {
        if (open) {
          area += ` L ${x(last)} ${y(0)} L ${x(segmentStart)} ${y(0)} Z`;
          open = false;
        }
        return;
      }
      const px = x(index);
      const py = y(point.percent);
      if (!open) {
        line += ` M ${px} ${py}`;
        area += ` M ${px} ${py}`;
        segmentStart = index;
        open = true;
      } else {
        line += ` L ${px} ${py}`;
        area += ` L ${px} ${py}`;
      }
      last = index;
    });
    if (open) area += ` L ${x(last)} ${y(0)} L ${x(segmentStart)} ${y(0)} Z`;
    return { linePath: line, areaPath: area, lastIndex: last };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, width]);

  const tickIndexes = useMemo(() => {
    if (points.length <= 1) return points.length === 1 ? [0] : [];
    const count = Math.min(4, points.length);
    return Array.from({ length: count }, (_, i) =>
      Math.round((i / (count - 1)) * (points.length - 1)),
    );
  }, [points]);

  function nearestIndex(clientX: number) {
    const rect = wrapRef.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    if (points.length <= 1) return points.length - 1;
    const raw = ((px - PAD.left) / Math.max(plotW, 1)) * (points.length - 1);
    return Math.min(points.length - 1, Math.max(0, Math.round(raw)));
  }

  const hovered = hover !== null ? points[hover] : null;
  const hasData = lastIndex >= 0;

  return (
    <div ref={wrapRef} className="relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label="Evolução da aderência geral no período"
          tabIndex={0}
          className="block focus-visible:outline-2 focus-visible:outline-action"
          onPointerMove={(e) => setHover(nearestIndex(e.clientX))}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(lastIndex >= 0 ? lastIndex : null)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              const delta = e.key === 'ArrowLeft' ? -1 : 1;
              setHover((current) =>
                Math.min(points.length - 1, Math.max(0, (current ?? lastIndex) + delta)),
              );
            }
            if (e.key === 'Escape') setHover(null);
          }}
        >
          {/* grid horizontal recessivo */}
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--color-line)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(tick) + 3.5}
                textAnchor="end"
                fontSize={11}
                fill="var(--color-muted)"
                fontFamily="var(--font-mono)"
              >
                {tick}
              </text>
            </g>
          ))}
          {tickIndexes.map((index) => (
            <text
              key={index}
              x={x(index)}
              y={HEIGHT - 8}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-muted)"
              fontFamily="var(--font-mono)"
            >
              {formatTick(points[index]!.date, interval)}
            </text>
          ))}

          {hasData && (
            <>
              <path d={areaPath} fill="var(--color-action)" opacity={0.1} />
              <path
                d={linePath}
                fill="none"
                stroke="var(--color-action)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* crosshair */}
              {hover !== null && points[hover]!.percent !== null && (
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  stroke="var(--color-line-strong)"
                  strokeWidth={1}
                />
              )}
              {hover !== null && points[hover]!.percent !== null && (
                <circle
                  cx={x(hover)}
                  cy={y(points[hover]!.percent!)}
                  r={4.5}
                  fill="var(--color-action)"
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                />
              )}
              {/* ponto e rótulo do valor atual */}
              <circle
                cx={x(lastIndex)}
                cy={y(points[lastIndex]!.percent!)}
                r={4.5}
                fill="var(--color-action)"
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
              <text
                x={x(lastIndex) + 10}
                y={y(points[lastIndex]!.percent!) + 4}
                fontSize={12}
                fontWeight={600}
                fill="var(--color-ink)"
                fontFamily="var(--font-ui)"
              >
                {points[lastIndex]!.percent}%
              </text>
            </>
          )}
          {!hasData && (
            <text
              x={PAD.left + plotW / 2}
              y={PAD.top + plotH / 2}
              textAnchor="middle"
              fontSize={13}
              fill="var(--color-muted)"
            >
              Sem avaliações no período.
            </text>
          )}
        </svg>
      )}

      {hovered && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 rounded-ctl border border-line bg-surface px-2.5 py-1.5 shadow-md"
          style={{
            left: Math.min(Math.max(x(hover!) + 10, 0), Math.max(width - 150, 0)),
            top: 4,
          }}
        >
          <p className="font-ui text-sm font-bold tabular-nums">
            {hovered.percent === null ? 'Sem avaliação' : `${hovered.percent}%`}
          </p>
          <p className="font-mono text-micro text-muted">
            {formatFull(hovered.date)} · {hovered.evaluated} ite
            {hovered.evaluated === 1 ? 'm avaliado' : 'ns avaliados'}
          </p>
        </div>
      )}
    </div>
  );
}
