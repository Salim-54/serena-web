import { useEffect, useRef, useState } from 'react';

// Single-series line chart in plain SVG: 2px line, faint area, recessive
// grid, crosshair + tooltip that snaps to the nearest point (pointer and
// keyboard). The history table under it is the table view for the same
// numbers, so the tooltip never gates a value.

export interface Point {
  label: string; // x-axis tick, e.g. "10/14 AM"
  detail: string; // tooltip heading, e.g. "Oct 14, 2026 07:00 AM"
  value: number;
}

const M = { top: 12, right: 16, bottom: 28, left: 56 };
const HEIGHT = 280;

function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => raw <= s)!;
  const ticks: number[] = [];
  for (let t = Math.floor(min / step) * step; t <= max + step * 0.5; t += step) {
    ticks.push(Number(t.toFixed(10)));
  }
  return ticks;
}

const fmt = (n: number) =>
  Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : Number.isInteger(n) ? String(n) : n.toFixed(2);

export default function LineChart({ points, unit }: { points: Point[]; unit: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const innerW = Math.max(width - M.left - M.right, 10);
  const innerH = HEIGHT - M.top - M.bottom;
  const x = (i: number) => M.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => M.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join('');
  const baseY = y(Math.max(yMin, Math.min(0, yMax)));
  const area = `${line}L${x(points.length - 1)},${baseY}L${x(0)},${baseY}Z`;
  const maxLabels = Math.max(2, Math.floor(innerW / 70));
  const every = Math.ceil(points.length / maxLabels);

  function nearest(clientX: number) {
    const rect = wrap.current!.getBoundingClientRect();
    const px = clientX - rect.left - M.left;
    const i = points.length === 1 ? 0 : Math.round((px / innerW) * (points.length - 1));
    return Math.max(0, Math.min(points.length - 1, i));
  }

  const a = active != null ? points[active] : null;

  return (
    <div
      className="chart"
      ref={wrap}
      tabIndex={0}
      aria-label="Chart. Use left and right arrow keys to read values."
      onPointerMove={(e) => setActive(nearest(e.clientX))}
      onPointerLeave={() => setActive(null)}
      onBlur={() => setActive(null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
        if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, (i ?? points.length) - 1));
      }}
    >
      <svg width={width} height={HEIGHT} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={M.left} x2={M.left + innerW} y1={y(t)} y2={y(t)} />
            <text className="axis" x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 ? (
            <text key={i} className="axis" x={x(i)} y={HEIGHT - 8} textAnchor="middle">
              {p.label}
            </text>
          ) : null,
        )}
        <path className="area" d={area} />
        <path className="line" d={line} />
        {points.length <= 14 && points.map((p, i) => <circle key={i} className="dot" cx={x(i)} cy={y(p.value)} r={4} />)}
        {a && (
          <>
            <line className="crosshair" x1={x(active!)} x2={x(active!)} y1={M.top} y2={M.top + innerH} />
            <circle className="dot active" cx={x(active!)} cy={y(a.value)} r={5} />
          </>
        )}
      </svg>
      {a && (
        <div
          className="tooltip"
          style={{
            left: Math.min(Math.max(x(active!), 80), width - 80),
            top: Math.max(y(a.value) - 12, 0),
          }}
        >
          <strong>{`${fmt(a.value)} ${unit}`.trim()}</strong>
          <span>{a.detail}</span>
        </div>
      )}
    </div>
  );
}
