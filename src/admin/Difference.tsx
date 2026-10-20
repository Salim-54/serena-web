import { useEffect, useState } from 'react';
import { type Difference as DifferenceData, type Period, fetchDifference, formatNumber, isoDate } from '../lib/utilities';

const PERIODS: { key: Period; label: string; help: string }[] = [
  { key: 'day', label: 'Daylight', help: 'Morning reading → evening reading, same day.' },
  { key: 'night', label: 'Night', help: "Evening reading → next morning's reading." },
  { key: 'full', label: 'Full Day', help: "Morning reading → next morning's reading (24h)." },
];

/** Usage per meter between two reading rounds (computed by the server). */
export default function Difference() {
  const [period, setPeriod] = useState<Period>('day');
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [data, setData] = useState<DifferenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDifference(date, period)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e) => !cancelled && setError((e as Error).message || 'Could not calculate differences.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date, period]);

  const fmt = (n: number | null) => (n === null ? '—' : formatNumber(n));

  return (
    <>
      <div className="card filters">
        <div className="seg" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.key} className={period === p.key ? 'active' : ''} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="inline">
          Date
          <input type="date" value={date} max={isoDate(new Date())} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <p className="muted small full">{PERIODS.find((p) => p.key === period)!.help}</p>
      </div>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Calculating differences…</p>}

      <div className={loading ? 'refetching' : ''}>
        {data?.groups.map((g) => (
          <section key={g.group} className="card metric-group">
            <h3>{g.group}</h3>
            {g.rows.map((r) => (
              <div key={r.metricId ?? r.name} className="metric-row">
                <div className="metric-info">
                  <div>{r.name}</div>
                  <div className="muted small">
                    {fmt(r.displayStart)} → {fmt(r.displayEnd)}
                  </div>
                </div>
                {r.displayDelta === null ? (
                  <em className="muted small">{r.start === null && r.end === null ? 'No readings' : r.start === null ? 'Missing start' : 'Missing end'}</em>
                ) : (
                  <strong className="metric-value">{`${r.displayDelta >= 0 ? '+' : ''}${formatNumber(r.displayDelta)} ${r.unit}`.trim()}</strong>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
