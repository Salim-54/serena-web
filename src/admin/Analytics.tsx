import { useEffect, useMemo, useState } from 'react';
import type { Session } from '../lib/auth';
import LineChart, { type Point } from '../components/LineChart';
import { permissionsFor } from '../lib/permissions';
import {
  type MetricView,
  type TimeSlot,
  type Trend,
  addDays,
  downloadReadingsExport,
  fetchAnalyticsMetrics,
  fetchTimeSlots,
  fetchTrend,
  formatNumber,
  isoDate,
  saveReading,
} from '../lib/utilities';

const PRESETS = [7, 30, 90];

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${m}/${d}`;
};
const longDate = (iso: string) =>
  new Date(iso + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const slotSuffix = (label: string | null) => (!label ? '' : label.toUpperCase().includes('AM') ? ' AM' : label.toUpperCase().includes('PM') ? ' PM' : '');

/** Per-metric chart + history. Server-computed series; editing only when the server allows it. */
export default function Analytics({ session }: { session: Session }) {
  const perms = permissionsFor(session);
  const today = isoDate(new Date());
  const [metrics, setMetrics] = useState<MetricView[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [metricId, setMetricId] = useState<number | null>(null);
  const [timeId, setTimeId] = useState<number | null>(null);
  const [start, setStart] = useState(() => addDays(today, -6));
  const [end, setEnd] = useState(today);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchAnalyticsMetrics(), fetchTimeSlots()])
      .then(([m, s]) => {
        setMetrics(m);
        setSlots(s);
        if (m.length) setMetricId(m[0].id);
      })
      .catch(() => setError('Could not load metrics.'));
  }, []);

  useEffect(() => {
    if (!metricId) return;
    let cancelled = false;
    setLoading(true);
    fetchTrend(metricId, start, end, timeId)
      .then((t) => {
        if (cancelled) return;
        setTrend(t);
        setError(null);
      })
      .catch((e) => !cancelled && setError((e as Error).message || 'Could not load readings.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [metricId, timeId, start, end]);

  const points: Point[] = useMemo(
    () =>
      (trend?.chart.points ?? []).map((p) => ({
        label: shortDate(p.date) + slotSuffix(p.timeLabel),
        detail: `${longDate(p.date)} · ${p.timeLabel}`,
        value: p.value,
      })),
    [trend],
  );

  const metric = trend?.metric;
  const unit = metric?.displayUnit ?? '';
  const activePreset = end === today ? PRESETS.find((d) => start === addDays(today, -(d - 1))) : undefined;

  async function exportExcel() {
    setExporting(true);
    try {
      await downloadReadingsExport(start, end);
    } catch (e) {
      setError(`Could not generate the Excel file: ${(e as Error).message}`);
    }
    setExporting(false);
  }

  return (
    <>
      <div className="card filters">
        <div className="seg" role="group" aria-label="Date range">
          {PRESETS.map((d) => (
            <button
              key={d}
              className={activePreset === d ? 'active' : ''}
              onClick={() => {
                setEnd(today);
                setStart(addDays(today, -(d - 1)));
              }}
            >
              {d} days
            </button>
          ))}
        </div>
        <label className="inline">
          From
          <input type="date" value={start} max={end} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </label>
        <label className="inline">
          To
          <input type="date" value={end} min={start} max={today} onChange={(e) => e.target.value && setEnd(e.target.value)} />
        </label>
        <label className="inline grow">
          Metric
          <select value={metricId ?? ''} onChange={(e) => setMetricId(Number(e.target.value))}>
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayUnit ? `${m.name} (${m.displayUnit})` : m.name}
              </option>
            ))}
          </select>
        </label>
        <div className="seg" role="group" aria-label="Time slot">
          <button className={timeId === null ? 'active' : ''} onClick={() => setTimeId(null)}>
            All
          </button>
          {slots.map((s) => (
            <button key={s.id} className={timeId === s.id ? 'active' : ''} onClick={() => setTimeId(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        {perms.utilities.exportReadings && (
          <button className="btn ghost small" onClick={exportExcel} disabled={exporting}>
            {exporting ? 'Generating…' : '⬇ Export Excel'}
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className={loading ? 'refetching' : ''}>
        {trend && metric && (
          <section className="card">
            <h3>{metric.name}</h3>
            <p className="muted small">
              {trend.chart.mode === 'difference' ? 'Difference between consecutive readings' : 'Recorded value over time'}
              {unit && ` (${unit})`}
            </p>
            {points.length === 0 ? (
              <p className="muted empty">
                {trend.readings.length === 1 && trend.chart.mode === 'difference' ? 'Need at least two readings to show a difference.' : 'No readings in this range.'}
              </p>
            ) : (
              <LineChart points={points} unit={unit} />
            )}
          </section>
        )}

        {trend && trend.readings.length > 0 && metric && (
          <section className="card history">
            <h3>History</h3>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  {perms.seeRecordedBy && <th>Recorded by</th>}
                  <th className="num">Value</th>
                  {trend.canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {[...trend.readings].reverse().map((r) => (
                  <HistoryRow
                    key={r.id}
                    reading={r}
                    unit={unit}
                    showRecordedBy={perms.seeRecordedBy}
                    onSave={
                      !trend.canEdit
                        ? undefined
                        : async (n) => {
                            const saved = await saveReading(metric.id, r.date, r.timeSlotId, n);
                            setTrend((prev) =>
                              prev && { ...prev, readings: prev.readings.map((x) => (x.id === saved.id ? { ...x, ...saved } : x)) },
                            );
                          }
                    }
                  />
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </>
  );
}

function HistoryRow({
  reading,
  unit,
  showRecordedBy,
  onSave,
}: {
  reading: Trend['readings'][number];
  unit: string;
  showRecordedBy: boolean;
  /** Absent = read-only. */
  onSave?: (n: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(reading.value));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save() {
    const n = Number(input.trim());
    if (input.trim() === '' || Number.isNaN(n)) {
      setFailed(true);
      return;
    }
    setBusy(true);
    try {
      await onSave!(n);
      setEditing(false);
      setFailed(false);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  return (
    <tr>
      <td>{longDate(reading.date)}</td>
      <td>{reading.timeLabel}</td>
      {showRecordedBy && <td className="muted">{reading.recordedBy ?? '—'}</td>}
      <td className="num">
        {editing ? (
          <form
            className="inline-edit"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input autoFocus inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} aria-invalid={failed} />
            <button className="btn primary small" disabled={busy}>
              Save
            </button>
          </form>
        ) : (
          <strong>{`${formatNumber(reading.displayValue)} ${unit}`.trim()}</strong>
        )}
      </td>
      {onSave && (
        <td>
          {editing ? (
            <button
              className="btn ghost small"
              onClick={() => {
                setEditing(false);
                setInput(String(reading.value));
                setFailed(false);
              }}
            >
              Cancel
            </button>
          ) : (
            <button className="btn ghost small" onClick={() => setEditing(true)} aria-label="Edit reading">
              Edit
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
