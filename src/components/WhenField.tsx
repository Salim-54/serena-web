import { toLocalInput } from '../lib/format';

// Custom time for a step (raise, assign, status change, note) on tickets
// raised by admin or maintenance staff. Deliberately low-key: a small grey
// link, because the automatic time is the normal case. [value] is a
// datetime-local string; null = now.

export default function WhenField({
  value,
  onChange,
  min,
  link = 'Done earlier?',
  label = 'Done at',
  hint = 'Only to record something that happened earlier.',
  disabled,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  /** Earliest allowed time (ISO), e.g. the last timeline entry. */
  min?: string | null;
  link?: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
}) {
  if (value === null) {
    return (
      <button type="button" className="link-btn backdate-toggle" disabled={disabled} onClick={() => onChange(toLocalInput(new Date()))}>
        {link}
      </button>
    );
  }
  // Inputs work in whole minutes: round the earliest time up so the minute
  // shown is really allowed.
  const minInput = min ? toLocalInput(new Date(Math.ceil(new Date(min).getTime() / 60_000) * 60_000)) : undefined;
  return (
    <div className="backdate">
      <label>
        {label}
        <input
          type="datetime-local"
          value={value}
          min={minInput}
          max={toLocalInput(new Date())}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
          required
        />
      </label>
      <p className="muted small">
        {hint}{' '}
        <button type="button" className="link-btn" disabled={disabled} onClick={() => onChange(null)}>
          Use the current time
        </button>
      </p>
    </div>
  );
}
