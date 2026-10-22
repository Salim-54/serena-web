import { useCallback, useEffect, useState } from 'react';
import type { Session } from '../lib/auth';
import { type PhotoPurpose, uploadTicketPhoto } from '../lib/photos';
import { compressImage } from '../lib/image';
import { SUPERVISOR_TRANSITIONS, canCustomizeTimes, permissionsFor } from '../lib/permissions';
import PhotoPicker from '../components/PhotoPicker';
import PhotoStrip from '../components/PhotoStrip';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import TechnicianList from '../components/TechnicianList';
import WhenField from '../components/WhenField';
import { formatDate, fromLocalInput, toLocalInput } from '../lib/format';
import {
  ALL_STATUSES,
  addNote,
  deleteTicket,
  formatHours,
  getAdminTicket,
  hoursBetween,
  listEvents,
  listTechnicians,
  setEventTimes,
  setStatus,
  setTechnicians,
  watchAllTickets,
  type AdminTicket,
  type Technician,
} from '../lib/maintenance';
import { useDraft } from '../lib/drafts';
import { navigate } from '../lib/router';
import { STATUS_LABELS, ticketNumber, type TicketEvent, type TicketStatus } from '../lib/tickets';

// Admin view of one ticket: full rights — assign/reassign at any stage, move
// to any status (incl. closing without the requester's approval and
// reopening), notes, edit, delete.
//
// Times are automatic. On tickets raised by admin or maintenance staff,
// those two roles can also give a step an earlier time ("Done earlier?"
// under assign / status / note) and adjust the timeline afterwards (a
// low-key "Adjust times" link); admins see who adjusted it.

function actionLabel(from: TicketStatus, to: TicketStatus): string {
  if (to === 'in_progress' && ['resolved', 'closed', 'cancelled'].includes(from)) return 'Reopen';
  if (to === 'resolved') return 'Mark resolved';
  if (to === 'closed') return 'Close';
  if (to === 'cancelled') return 'Cancel ticket';
  if (to === 'open') return 'Back to open';
  return STATUS_LABELS[to];
}

/** Label of the "Done earlier?" time for a move to each status. */
const STEP_TIME_LABELS: Record<TicketStatus, string> = {
  open: 'Back to open at',
  assigned: 'Assigned at',
  in_progress: 'Started at',
  on_hold: 'Put on hold at',
  resolved: 'Resolved at',
  closed: 'Closed at',
  cancelled: 'Cancelled at',
};

export default function ManageTicket({ session, id }: { session: Session; id: string }) {
  const [ticket, setTicket] = useState<AdminTicket | null | undefined>(undefined);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [technicians, setTechnicianList] = useState<Technician[]>([]);
  // Unsaved technician selection; null = showing what's saved.
  const [picked, setPicked] = useState<Set<number> | null>(null);
  // Unsent status change / notes survive a refresh.
  // Photos are uploaded as soon as they're picked (named after the ticket)
  // and their URLs kept in the draft.
  const [statusDraft, setStatusDraft, statusDraftCtl] = useDraft<{ status: TicketStatus | null; note: string; photos?: string[]; at?: string | null }>(
    `manage-status:${id}`,
    { status: null, note: '', photos: [] },
  );
  const pendingStatus = statusDraft.status;
  const note = statusDraft.note;
  const statusPhotos = statusDraft.photos ?? [];
  const setPendingStatus = (s: TicketStatus | null) => setStatusDraft((d) => ({ ...d, status: s }));
  const setNote = (n: string) => setStatusDraft((d) => ({ ...d, note: n }));
  const [noteDraft, setNoteDraft, noteDraftCtl] = useDraft<{ text: string; photos: string[]; at?: string | null }>(`manage-note:v2:${id}`, { text: '', photos: [] });
  // "Done earlier?" time for the technician change (datetime-local; null = now).
  const [techAt, setTechAt] = useState<string | null>(null);
  // Timeline times being adjusted (event id → datetime-local value); null = not editing.
  const [times, setTimes] = useState<Record<number, string> | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await getAdminTicket(id);
      setTicket(t);
      if (t) setEvents(await listEvents(t.id));
    } catch {
      setError('Could not load this ticket.');
    }
  }, [id]);

  useEffect(() => {
    load();
    listTechnicians().then(setTechnicianList).catch(() => {});
    return watchAllTickets(load);
  }, [load]);

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await load();
      setMessage(done);
    } catch (e) {
      setError((e as Error).message || 'Something went wrong.');
    }
    setBusy(false);
  }

  if (ticket === undefined) return <p className="muted">Loading…</p>;
  if (ticket === null)
    return (
      <p className="muted">
        Ticket not found. <a href="#/maintenance">Back to Maintenance</a>
      </p>
    );

  const perms = permissionsFor(session);
  // Full managers may set any status; supervisors follow the workflow table.
  const nextStatuses = ALL_STATUSES.filter((s) =>
    s !== ticket.status && (perms.tickets.manage || (SUPERVISOR_TRANSITIONS[ticket.status] ?? []).includes(s)),
  );
  const canAssign = perms.tickets.manage || (perms.tickets.workflow && !['resolved', 'closed', 'cancelled'].includes(ticket.status));
  const canEditTimes = canCustomizeTimes(session, ticket);
  // Custom step times must come after the last timeline entry.
  const lastEventAt = events.length ? events[events.length - 1].created_at : ticket.created_at;
  const stepAt = (v: string | null | undefined) => (canEditTimes && v ? fromLocalInput(v) : null);
  const changedTimes = times
    ? Object.fromEntries(
        events.filter((e) => times[e.id] && times[e.id] !== toLocalInput(e.created_at)).map((e) => [e.id, fromLocalInput(times[e.id])]),
      )
    : {};
  const nowInput = toLocalInput(new Date());

  /** Compress + upload (the server names it, e.g. "MT-00012-resolved-…"); [onUrl] gets each URL. */
  async function uploadPhotos(files: File[], purpose: PhotoPurpose, onUrl: (url: string) => void) {
    setUploadingCount((n) => n + files.length);
    for (const f of files) {
      try {
        onUrl(await uploadTicketPhoto(await compressImage(f), ticket!.id, purpose));
      } catch {
        setError('A photo failed to upload — try again.');
      } finally {
        setUploadingCount((n) => n - 1);
      }
    }
  }
  const assignedIds = new Set(ticket.technicians.map((t) => t.id));
  const technicianOptions = technicians.filter((t) => t.active || assignedIds.has(t.id));
  const pickedIds = picked ?? assignedIds;
  const pickDirty = picked !== null && (picked.size !== assignedIds.size || [...picked].some((id) => !assignedIds.has(id)));

  return (
    <>
      <div className="page-head">
        <a href="#/maintenance" className="back">← Maintenance</a>
        <div className="actions" style={{ marginTop: 0 }}>
          {perms.tickets.manage && (
            <>
              <a className="btn ghost small" href={`#/maintenance/tickets/${ticket.id}/edit`}>Edit details</a>
              <button className="btn ghost small danger-text" onClick={() => setConfirmDelete(true)} disabled={busy}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="callout danger">
          <p>Delete {ticketNumber(ticket.id)} permanently? Its timeline is removed too. To keep a record, cancel it instead.</p>
          <div className="actions">
            <button
              className="btn danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await deleteTicket(ticket.id);
                  navigate('/maintenance');
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              Delete ticket
            </button>
            <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
          </div>
        </div>
      )}

      <div className="manage-grid">
        <article className="card detail">
          <div className="row-top">
            <span className="muted mono">{ticketNumber(ticket.id)}</span>
            <span className="spacer" />
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
          </div>
          <h2>{ticket.title}</h2>
          {ticket.description && <p className="description">{ticket.description}</p>}
          <dl className="facts">
            <dt>Department</dt>
            <dd>{ticket.dept?.name ?? '—'}</dd>
            <dt>{ticket.technicians.length > 1 ? 'Technicians' : 'Technician'}</dt>
            <dd>
              <TechnicianList technicians={ticket.technicians} empty="Unassigned" />
            </dd>
            <dt>Requested by</dt>
            <dd>{ticket.requester_name}</dd>
            <dt>Location</dt>
            <dd>{ticket.location}</dd>
            <dt>Category</dt>
            <dd>{ticket.category}</dd>
            <dt>Raised</dt>
            <dd>{formatDate(ticket.created_at)}</dd>
            <dt>Time to assign</dt>
            <dd>{formatHours(hoursBetween(ticket.created_at, ticket.assigned_at))}</dd>
            <dt>Time to resolve</dt>
            <dd>{formatHours(hoursBetween(ticket.created_at, ticket.resolved_at))}</dd>
          </dl>
          {ticket.photos.length > 0 && (
            <PhotoStrip photos={ticket.photos} size={96} />
          )}
        </article>

        <aside className="card manage-panel">
          <h3>Technicians</h3>
          {!canAssign && <p className="muted small">Technicians can't be changed at this stage.</p>}
          {technicianOptions.length === 0 ? (
            <p className="muted small">
              No technicians yet. <a href="#/maintenance/technicians">Add technicians</a>
            </p>
          ) : (
            <div className="tech-picker">
              {technicianOptions.map((t) => (
                <label key={t.id} className="check">
                  <input
                    type="checkbox"
                    checked={pickedIds.has(t.id)}
                    disabled={busy || !canAssign}
                    onChange={(e) => {
                      const next = new Set(pickedIds);
                      if (e.target.checked) next.add(t.id);
                      else next.delete(t.id);
                      setPicked(next);
                    }}
                  />
                  <span>
                    {t.name}
                    {t.trade && <span className="muted small"> — {t.trade}</span>}
                  </span>
                </label>
              ))}
              {pickDirty && (
                <div className="actions">
                  <button
                    className="btn primary small"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await setTechnicians(ticket, [...pickedIds], stepAt(techAt));
                        setPicked(null);
                        setTechAt(null);
                      }, pickedIds.size ? `Assigned to ${technicians.filter((t) => pickedIds.has(t.id)).map((t) => t.name).join(', ')}` : 'Technicians removed')
                    }
                  >
                    Save technicians
                  </button>
                  <button className="btn ghost small" onClick={() => setPicked(null)}>Undo</button>
                </div>
              )}
              {pickDirty && canEditTimes && (
                <WhenField value={techAt} onChange={setTechAt} min={lastEventAt} label="Assigned at" disabled={busy} />
              )}
            </div>
          )}

          <h3>Status</h3>
          {ticket.status === 'resolved' && (
            <p className="muted small">Waiting for {ticket.dept?.name ?? 'the department'} to confirm. As admin you can also close it.</p>
          )}
          <div className="status-actions">
            {nextStatuses.map((s) => (
              <button
                key={s}
                className={`btn small status-btn status-${s} ${pendingStatus === s ? 'selected' : ''}`}
                disabled={busy}
                onClick={() => setPendingStatus(pendingStatus === s ? null : s)}
              >
                {actionLabel(ticket.status, s)}
              </button>
            ))}
          </div>
          {pendingStatus && (
            <div className="pending">
              <textarea
                rows={2}
                placeholder={pendingStatus === 'resolved' ? 'What was done? (optional)' : 'Note (optional)'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <PhotoStrip photos={statusPhotos} size={56} />
              <PhotoPicker
                compact
                disabled={busy}
                onFiles={(files) =>
                  uploadPhotos(files, pendingStatus as PhotoPurpose, (url) => setStatusDraft((d) => ({ ...d, photos: [...(d.photos ?? []), url] })))
                }
              />
              {uploadingCount > 0 && <p className="muted small">Uploading {uploadingCount} photo(s)…</p>}
              {canEditTimes && (
                <WhenField
                  value={statusDraft.at ?? null}
                  onChange={(at) => setStatusDraft((d) => ({ ...d, at }))}
                  min={lastEventAt}
                  label={STEP_TIME_LABELS[pendingStatus]}
                  disabled={busy}
                />
              )}
              <div className="actions">
                <button
                  className="btn primary small"
                  disabled={busy || uploadingCount > 0}
                  onClick={() =>
                    run(async () => {
                      await setStatus(ticket, pendingStatus, note, statusPhotos, stepAt(statusDraft.at));
                      statusDraftCtl.discard();
                    }, `Moved to ${STATUS_LABELS[pendingStatus]}`)
                  }
                >
                  Confirm: {actionLabel(ticket.status, pendingStatus)}
                </button>
                <button className="btn ghost small" onClick={() => setPendingStatus(null)}>Cancel</button>
              </div>
            </div>
          )}

          <h3>Add note</h3>
          <form
            className="pending"
            onSubmit={(e) => {
              e.preventDefault();
              if (!noteDraft.text.trim() && !noteDraft.photos.length) return;
              run(async () => {
                await addNote(ticket.id, noteDraft.text, noteDraft.photos, stepAt(noteDraft.at));
                noteDraftCtl.discard();
              }, 'Note added');
            }}
          >
            <textarea
              rows={2}
              value={noteDraft.text}
              onChange={(e) => setNoteDraft((d) => ({ ...d, text: e.target.value }))}
              placeholder="Visible on the timeline to the department too"
            />
            <PhotoStrip photos={noteDraft.photos} size={56} />
            <PhotoPicker
              compact
              disabled={busy}
              onFiles={(files) => uploadPhotos(files, 'note', (url) => setNoteDraft((d) => ({ ...d, photos: [...d.photos, url] })))}
            />
            {canEditTimes && (noteDraft.text.trim() || noteDraft.photos.length > 0) && (
              <WhenField
                value={noteDraft.at ?? null}
                onChange={(at) => setNoteDraft((d) => ({ ...d, at }))}
                min={lastEventAt}
                label="Noted at"
                disabled={busy}
              />
            )}
            <button className="btn ghost small" disabled={busy || uploadingCount > 0}>Add note</button>
          </form>

          {message && <p className="ok small" aria-live="polite">✓ {message}</p>}
          {error && !times && <p className="error">{error}</p>}
        </aside>
      </div>

      <div className="timeline-head">
        <h3>Timeline</h3>
        {canEditTimes && !times && (
          <button
            className="link-btn quiet"
            onClick={() => {
              setTimes(Object.fromEntries(events.map((e) => [e.id, toLocalInput(e.created_at)])));
              setError(null);
              setMessage(null);
            }}
          >
            Adjust times
          </button>
        )}
      </div>
      {times && (
        <div className="callout">
          <p className="small">
            Times are normally recorded automatically. Change only what needs correcting — the ticket's raised, assigned,
            resolved and closed times and its stats follow the timeline.
          </p>
          <div className="actions">
            <button
              className="btn primary small"
              disabled={busy || !Object.keys(changedTimes).length}
              onClick={() =>
                run(async () => {
                  await setEventTimes(ticket.id, changedTimes);
                  setTimes(null);
                }, 'Times updated')
              }
            >
              Save times
            </button>
            <button className="btn ghost small" disabled={busy} onClick={() => setTimes(null)}>
              Cancel
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}
      <ol className="timeline">
        {[...events].reverse().map((e) => (
          <li key={e.id} className={times && changedTimes[e.id] ? 'time-changed' : ''}>
            <div>
              {e.type === 'created'
                ? 'Ticket raised'
                : e.type === 'status_changed'
                  ? `${e.from_status ? STATUS_LABELS[e.from_status] : '?'} → ${e.to_status ? STATUS_LABELS[e.to_status] : '?'}`
                  : (e.note ?? '')}
            </div>
            <PhotoStrip photos={e.photos ?? []} />
            {times ? (
              <div className="muted small time-edit">
                {e.actor_name ? `${e.actor_name} · ` : ''}
                <input
                  type="datetime-local"
                  value={times[e.id] ?? ''}
                  max={nowInput}
                  disabled={busy}
                  aria-label="Time"
                  onChange={(ev) => setTimes((t) => ({ ...t, [e.id]: ev.target.value }))}
                />
              </div>
            ) : (
              <div className="muted small">
                {e.actor_name ? `${e.actor_name} · ` : ''}
                {formatDate(e.created_at)}
              </div>
            )}
          </li>
        ))}
      </ol>
      {ticket.times_edited_by && ticket.times_edited_at && (
        <p className="muted small">
          Times adjusted by hand by {ticket.times_edited_by} on {formatDate(ticket.times_edited_at)}.
        </p>
      )}
    </>
  );
}
