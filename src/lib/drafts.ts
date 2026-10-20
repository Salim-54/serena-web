import { useCallback, useEffect, useRef, useState } from 'react';

// Form drafts that survive a refresh — and, importantly on phones, the page
// being reloaded after the camera app opens (the browser may discard the
// page while the camera is in front). Saved to localStorage on every change
// and cleared once the form is submitted. Drafts older than 14 days are
// ignored.

const PREFIX = 'rm_draft:';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const { v, at } = JSON.parse(raw) as { v: T; at: number };
    if (Date.now() - at > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + key);
      return undefined;
    }
    return v;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ v: value, at: Date.now() }));
  } catch {
    // Storage full / blocked: the form still works, just without a draft.
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

/**
 * useState that is persisted under [key] while the user edits. Returns
 * `restored: true` when the initial value came from a saved draft, and
 * `discard()` to drop the draft and go back to [initial].
 */
export function useDraft<T>(key: string, initial: T | (() => T)) {
  const initialRef = useRef(initial);
  const [state, setState] = useState<{ value: T; restored: boolean }>(() => {
    const saved = read<T>(key);
    if (saved !== undefined) return { value: saved, restored: true };
    const init = initialRef.current;
    return { value: typeof init === 'function' ? (init as () => T)() : init, restored: false };
  });
  const dirty = useRef(state.restored);

  useEffect(() => {
    if (dirty.current) write(key, state.value);
  }, [key, state.value]);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    dirty.current = true;
    setState((s) => ({
      value: typeof next === 'function' ? (next as (p: T) => T)(s.value) : next,
      restored: s.restored,
    }));
  }, []);

  const discard = useCallback(() => {
    clearDraft(key);
    dirty.current = false;
    const init = initialRef.current;
    setState({ value: typeof init === 'function' ? (init as () => T)() : init, restored: false });
  }, [key]);

  /** Call after a successful submit. */
  const clear = useCallback(() => {
    clearDraft(key);
    dirty.current = false;
  }, [key]);

  return [state.value, set, { restored: state.restored, discard, clear }] as const;
}
