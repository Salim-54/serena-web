import { useCallback, useEffect, useState } from 'react';
import type { Session } from '../lib/auth';
import { useDraft } from '../lib/drafts';
import { permissionsFor } from '../lib/permissions';
import { type MetricView, type ReadingView, type Sheet, type TimeSlot, fetchSheet, fetchTimeSlots, formatNumber, isMorning, isoDate, saveReading } from '../lib/utilities';

const LOCKED_MESSAGE =
  'Recording for this time slot is only allowed within 12 hours of it (e.g. the 7:00 AM reading locks at 7:00 PM). Ask an admin to make changes outside this window.';

function closestSlot(slots: TimeSlot[]): number | null {
  const wanted = new Date().getHours() < 12 ? slots.find(isMorning) : [...slots].reverse().find((s) => !isMorning(s));
  return (wanted ?? slots[0])?.id ?? null;
}

/** Recording: every metric for a date + slot. The server says what may be edited (record window). */
export default function Recording({ session }: { session: Session }) {
  const perms = permissionsFor(session);
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [slots, setSlots] = useState<TimeSlot[] | null>(null);
  const [timeId, setTimeId] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTimeSlots()
      .then((s) => {
        setSlots(s);
        setTimeId(closestSlot(s));
      })
      .catch(() => setError('Could not load time slots.'));
  }, []);

  const load = useCallback(async () => {
    if (!timeId) return;
    setLoading(true);
    try {
      setSheet(await fetchSheet(date, timeId));
      setError(null);
    } catch (e) {
      setError((e as Error).message || 'Could not load readings.');
    }
    setLoading(false);
  }, [date, timeId]);

  useEffect(() => {
    load();
  }, [load]);

  if (slots && slots.length === 0) return <p className="muted">No time slots configured yet.</p>;

  const anyEditable = sheet?.groups.some((g) => g.entries.some((e) => e.canEdit)) ?? true;

  return (
    <>
      <div className="card filters">
        <label className="inline">
          Date
          <input type="date" value={date} max={isoDate(new Date())} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <div className="seg" role="group" aria-label="Time slot">
          {(slots ?? []).map((s) => (
            <button key={s.id} className={timeId === s.id ? 'active' : ''} onClick={() => setTimeId(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        {sheet && (
          <div className="progress" title={`${sheet.recorded} of ${sheet.total} recorded`}>
            <div className="bar" style={{ width: sheet.total ? `${(sheet.recorded / sheet.total) * 100}%` : 0 }} />
            <span>
              {sheet.recorded} of {sheet.total} recorded
            </span>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {sheet && !anyEditable && <p className="locked-note">🔒 {LOCKED_MESSAGE}</p>}

      <div className={loading ? 'refetching' : ''}>
        {sheet?.groups.map((g) => (
          <section key={g.group} className="card metric-group">
            <h3>{g.group}</h3>
            {g.entries.map((e) => (
              <MetricRow
                key={`${e.metric.id}-${date}-${timeId}`}
                draftKey={`reading:${date}:${timeId}:${e.metric.id}`}
                metric={e.metric}
                value={e.reading}
                canEdit={e.canEdit}
                showRecordedBy={perms.seeRecordedBy}
                onSave={async (n) => {
                  const saved = await saveReading(e.metric.id, date, timeId!, n);
                  setSheet((prev) =>
                    prev && {
                      ...prev,
                      recorded: prev.recorded + (e.reading ? 0 : 1),
                      groups: prev.groups.map((gg) => ({
                        ...gg,
                        entries: gg.entries.map((x) => (x.metric.id === e.metric.id ? { ...x, reading: saved } : x)),
                      })),
                    },
                  );
                }}
              />
            ))}
          </section>
        ))}
      </div>
    </>
  );
}

function MetricRow({
  draftKey,
  metric,
  value,
  canEdit,
  showRecordedBy,
  onSave,
}: {
  draftKey: string;
  metric: MetricView;
  value: ReadingView | null;
  canEdit: boolean;
  showRecordedBy: boolean;
  onSave: (n: number) => Promise<void>;
}) {
  // The input holds the raw meter number; a typed-but-unsaved value is a draft.
  const [typed, setTyped, typedCtl] = useDraft<string | null>(draftKey, null);
  const input = typed ?? (value ? String(value.value) : '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const dirty = input.trim() !== (value ? String(value.value) : '');

  async function save() {
    const n = Number(input.trim());
    if (input.trim() === '' || Number.isNaN(n)) {
      setState('error');
      setMessage('Enter a number');
      return;
    }
    setState('saving');
    try {
      await onSave(n);
      typedCtl.discard();
      setState('saved');
      setMessage(null);
    } catch (e) {
      setState('error');
      setMessage((e as Error).message);
    }
  }

  return (
    <div className="metric-row">
      <div className="metric-info">
        <div>{metric.name}</div>
        <div className={value ? 'metric-value' : 'muted small'}>
          {value ? `${formatNumber(value.displayValue)} ${metric.displayUnit}`.trim() : 'Not recorded'}
        </div>
        {showRecordedBy && value?.recordedBy && <div className="muted small">by {value.recordedBy}</div>}
      </div>
      {!canEdit ? (
        <span className="muted small" title={LOCKED_MESSAGE}>
          🔒 Locked
        </span>
      ) : (
        <form
          className="metric-input"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) save();
          }}
        >
          <input
            inputMode="decimal"
            value={input}
            onChange={(e) => {
              setTyped(e.target.value);
              setState('idle');
            }}
            placeholder="Reading"
            aria-label={`${metric.name} reading`}
            aria-invalid={state === 'error'}
          />
          <button className="btn primary small" disabled={!dirty || state === 'saving'}>
            {state === 'saving' ? '…' : value ? 'Update' : 'Save'}
          </button>
          <span className="save-state small" aria-live="polite">
            {state === 'saved' && '✓ Saved'}
            {state === 'error' && <span className="error">{message ?? 'Failed'}</span>}
          </span>
        </form>
      )}
    </div>
  );
}
