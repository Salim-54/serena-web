import { useEffect, useState, type FormEvent } from 'react';
import { photosEnabled, thumbnail, uploadTicketPhoto } from '../lib/photos';
import { useDraft } from '../lib/drafts';
import { compressImage } from '../lib/image';
import { clearPending, loadPending, savePending } from '../lib/pendingPhotos';
import { CATEGORIES, PRIORITIES, appendTicketPhotos, ticketNumber as formatNumber } from '../lib/tickets';
import type { Department, TicketFields } from '../lib/maintenance';
import PhotoPicker from './PhotoPicker';

// Shared by the department "New request" page and the console raise/edit
// screens.
//
// Everything typed is kept as a draft (lib/drafts.ts). Photos are uploaded
// to the API, which stores them and names them after the ticket
// ("MT-00012-request-…"):
//   * editing an existing ticket → compressed and uploaded straight away;
//   * new ticket → the number doesn't exist yet, so compressed photos wait
//     on the device (lib/pendingPhotos.ts, survives a reload) and are
//     uploaded right after the ticket is created.

const MAX_PHOTOS = 4;

export interface TicketFormValues extends TicketFields {
  department: number | null;
}

interface Preview {
  id: number;
  url: string;
  uploading?: boolean;
  error?: string;
}

let nextId = 1;

export default function TicketForm({
  draftKey,
  initial,
  departments,
  filedUnder,
  ticketId,
  submitLabel,
  onSubmit,
  onDone,
  onCancelHref = '#/',
}: {
  /** Where the draft is saved, e.g. "new-ticket:3" or "edit-ticket:12". */
  draftKey: string;
  initial: Partial<TicketFormValues>;
  /** When given, a department picker is shown (admin). */
  departments?: Department[];
  /** Read-only "Filed under" label when the department is fixed (e.g. Maintenance). */
  filedUnder?: string;
  /** Set when editing an existing ticket (photos upload immediately under it). */
  ticketId?: number;
  submitLabel: string;
  /** Saves the ticket and returns its id. */
  onSubmit: (values: TicketFormValues) => Promise<number>;
  /** After the ticket and its photos are saved. */
  onDone: (id: number) => void;
  onCancelHref?: string;
}) {
  const [v, setV, draft] = useDraft<TicketFormValues>(draftKey, () => ({
    department: initial.department ?? null,
    requester_name: initial.requester_name ?? '',
    title: initial.title ?? '',
    location: initial.location ?? '',
    category: initial.category ?? CATEGORIES[0],
    priority: initial.priority ?? 'normal',
    description: initial.description ?? '',
    photos: initial.photos ?? [],
  }));
  // New tickets only: compressed photos waiting for the ticket number.
  const [pending, setPending] = useState<Blob[]>([]);
  const [pendingUrls, setPendingUrls] = useState<string[]>([]);
  // Editing only: uploads in flight.
  const [uploads, setUploads] = useState<Preview[]>([]);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof TicketFormValues>(key: K, value: TicketFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  // Restore photos picked before a reload.
  useEffect(() => {
    if (ticketId) return;
    loadPending(draftKey).then((blobs) => blobs.length && setPending(blobs));
  }, [draftKey, ticketId]);

  useEffect(() => {
    const urls = pending.map((b) => URL.createObjectURL(b));
    setPendingUrls(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [pending]);

  const categories = CATEGORIES.includes(v.category) ? CATEGORIES : [...CATEGORIES, v.category];
  const uploading = uploads.some((u) => u.uploading);
  const room = MAX_PHOTOS - v.photos.length - pending.length - uploads.filter((u) => u.uploading).length;

  async function addFiles(files: File[]) {
    const take = files.slice(0, Math.max(room, 0));
    if (!take.length) return;
    if (!ticketId) {
      const compressed = await Promise.all(take.map(compressImage));
      const next = [...pending, ...compressed].slice(0, MAX_PHOTOS - v.photos.length);
      setPending(next);
      await savePending(draftKey, next);
      return;
    }
    for (const file of take) {
      const item: Preview = { id: nextId++, url: URL.createObjectURL(file), uploading: true };
      setUploads((u) => [...u, item]);
      try {
        const url = await uploadTicketPhoto(await compressImage(file), ticketId, 'request');
        setV((prev) => ({ ...prev, photos: [...prev.photos, url].slice(0, MAX_PHOTOS) }));
        setUploads((u) => u.filter((x) => x.id !== item.id));
        URL.revokeObjectURL(item.url);
      } catch {
        setUploads((u) => u.map((x) => (x.id === item.id ? { ...x, uploading: false, error: 'Upload failed' } : x)));
      }
    }
  }

  async function removePending(i: number) {
    const next = pending.filter((_, j) => j !== i);
    setPending(next);
    await savePending(draftKey, next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (uploading) return;
    setBusy(true);
    setError(null);
    try {
      // If an earlier attempt created the ticket but a photo failed, don't
      // create it twice — just retry the photos.
      const id =
        savedId ??
        (await onSubmit({
          ...v,
          requester_name: v.requester_name.trim(),
          title: v.title.trim(),
          location: v.location.trim(),
          description: v.description.trim(),
        }));
      setSavedId(id);
      if (pending.length) {
        const number = formatNumber(id);
        const remaining: Blob[] = [];
        const urls: string[] = [];
        for (const blob of pending) {
          try {
            urls.push(await uploadTicketPhoto(blob, id, 'request'));
          } catch {
            remaining.push(blob);
          }
        }
        await appendTicketPhotos(id, urls);
        setPending(remaining);
        await savePending(draftKey, remaining);
        if (remaining.length) {
          throw new Error(`${number} was saved, but ${remaining.length} photo(s) didn't upload. Check the connection and press the button again.`);
        }
        await clearPending(draftKey);
      }
      draft.clear();
      onDone(id);
    } catch (err) {
      setError((err as Error).message || 'Could not save.');
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      {draft.restored && !savedId && (
        <div className="draft-note">
          <span>Restored your unsent draft.</span>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              draft.discard();
              setPending([]);
              clearPending(draftKey);
            }}
          >
            Discard draft
          </button>
        </div>
      )}
      {departments && (
        <label>
          Department
          <select value={v.department ?? ''} onChange={(e) => set('department', Number(e.target.value))} required>
            <option value="" disabled>
              Select department…
            </option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {filedUnder && (
        <p className="filed-under">
          Filed under <strong>{filedUnder}</strong>
        </p>
      )}
      <label>
        {departments || filedUnder ? 'Requested by' : 'Your name'}
        <input value={v.requester_name} onChange={(e) => set('requester_name', e.target.value)} required placeholder="Who is raising this?" />
      </label>
      <label>
        What's the problem?
        <input value={v.title} onChange={(e) => set('title', e.target.value)} required maxLength={120} placeholder="e.g. AC not cooling" />
      </label>
      <div className="grid-2">
        <label>
          Location
          <input value={v.location} onChange={(e) => set('location', e.target.value)} required placeholder="Room 214, Lobby, Kitchen…" />
        </label>
        <label>
          Category
          <select value={v.category} onChange={(e) => set('category', e.target.value)}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="priority">
        <legend>Priority</legend>
        {PRIORITIES.map((p) => (
          <label key={p} className={`chip priority-${p} ${v.priority === p ? 'selected' : ''}`}>
            <input type="radio" name="priority" value={p} checked={v.priority === p} onChange={() => set('priority', p)} />
            {p}
          </label>
        ))}
      </fieldset>
      <label>
        Details
        <textarea value={v.description} onChange={(e) => set('description', e.target.value)} rows={4} placeholder="Anything that helps the technician" />
      </label>

      <div className="photos-field">
        <span>Photos (optional, up to {MAX_PHOTOS})</span>
        {!photosEnabled ? (
          <p className="muted small">Photo uploads are not set up yet. Contact the system admin.</p>
        ) : (
          <>
            <div className="photo-grid">
              {v.photos.map((url) => (
                <div key={url} className="photo">
                  <img src={thumbnail(url)} alt="" />
                  <button type="button" onClick={() => set('photos', v.photos.filter((u) => u !== url))} aria-label="Remove photo">
                    ×
                  </button>
                </div>
              ))}
              {pendingUrls.map((url, i) => (
                <div key={url} className="photo">
                  <img src={url} alt="" />
                  <button type="button" onClick={() => removePending(i)} aria-label="Remove photo">
                    ×
                  </button>
                </div>
              ))}
              {uploads.map((u) => (
                <div key={u.id} className={`photo ${u.error ? 'failed' : 'uploading'}`}>
                  <img src={u.url} alt="" />
                  <span className="photo-status">{u.error ?? 'Uploading…'}</span>
                  {u.error && (
                    <button type="button" aria-label="Remove photo" onClick={() => setUploads((list) => list.filter((x) => x.id !== u.id))}>
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            {pending.length > 0 && <p className="muted small">Photos upload with the ticket number when you submit.</p>}
            {room > 0 && <PhotoPicker onFiles={addFiles} />}
          </>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="btn primary" disabled={busy || uploading}>
          {uploading ? 'Uploading photos…' : busy ? (pending.length ? 'Saving & uploading photos…' : 'Saving…') : savedId ? 'Retry photo upload' : submitLabel}
        </button>
        <a className="btn ghost" href={onCancelHref}>
          Cancel
        </a>
      </div>
    </form>
  );
}
