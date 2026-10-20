import { useCallback, useEffect, useState } from 'react';
import type { Session } from '../lib/auth';
import { type PhotoPurpose, uploadTicketPhoto } from '../lib/cloudinary';
import { compressImage } from '../lib/image';
import { SUPERVISOR_TRANSITIONS, permissionsFor } from '../lib/permissions';
import PhotoPicker from '../components/PhotoPicker';
import PhotoStrip from '../components/PhotoStrip';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import TechnicianList from '../components/TechnicianList';
import { thumbnail } from '../lib/cloudinary';
import { formatDate } from '../lib/format';
import {
  ALL_STATUSES,
  addNote,
  deleteTicket,
  formatHours,
  getAdminTicket,
  hoursBetween,
  listEvents,
  listTechnicians,
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

function actionLabel(from: TicketStatus, to: TicketStatus): string {
  if (to === 'in_progress' && ['resolved', 'closed', 'cancelled'].includes(from)) return 'Reopen';
  if (to === 'resolved') return 'Mark resolved';
  if (to === 'closed') return 'Close';
  if (to === 'cancelled') return 'Cancel ticket';
  if (to === 'open') return 'Back to open';
  return STATUS_LABELS[to];
}

export default function ManageTicket({ session, id }: { session: Session; id: string }) {
  const [ticket, setTicket] = useState<AdminTicket | null | undefined>(undefined);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [technicians, setTechnicianList] = useState<Technician[]>([]);
  // Unsaved technician selection; null = showing what's saved.
  const [picked, setPicked] = useState<Set<number> | null>(null);
  // Unsent status change / notes survive a refresh.
  // Photos are uploaded as soon as they're picked (named after the ticket)
  // and their URLs kept in the draft.
  const [statusDraft, setStatusDraft, statusDraftCtl] = useDraft<{ status: TicketStatus | null; note: string; photos?: string[] }>(
    `manage-status:${id}`,
    { status: null, note: '', photos: [] },
  );
  const pendingStatus = statusDraft.status;
  const note = statusDraft.note;
  const statusPhotos = statusDraft.photos ?? [];
  const setPendingStatus = (s: TicketStatus | null) => setStatusDraft((d) => ({ ...d, status: s }));
  const setNote = (n: string) => setStatusDraft((d) => ({ ...d, note: n }));
  const [noteDraft, setNoteDraft, noteDraftCtl] = useDraft<{ text: string; photos: string[] }>(`manage-note:v2:${id}`, { text: '', photos: [] });
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
            <div className="photo-grid">
              {ticket.photos.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="photo">
                  <img src={thumbnail(url)} alt="" />
                </a>
              ))}
            </div>
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
                        await setTechnicians(ticket, [...pickedIds]);
                        setPicked(null);
                      }, pickedIds.size ? `Assigned to ${technicians.filter((t) => pickedIds.has(t.id)).map((t) => t.name).join(', ')}` : 'Technicians removed')
                    }
                  >
                    Save technicians
                  </button>
                  <button className="btn ghost small" onClick={() => setPicked(null)}>Undo</button>
                </div>
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
              <div className="actions">
                <button
                  className="btn primary small"
                  disabled={busy || uploadingCount > 0}
                  onClick={() =>
                    run(async () => {
                      await setStatus(ticket, pendingStatus, note, statusPhotos);
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
                await addNote(ticket.id, noteDraft.text, noteDraft.photos);
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
            <button className="btn ghost small" disabled={busy || uploadingCount > 0}>Add note</button>
          </form>

          {message && <p className="ok small" aria-live="polite">✓ {message}</p>}
          {error && <p className="error">{error}</p>}
        </aside>
      </div>

      <h3>Timeline</h3>
      <ol className="timeline">
        {[...events].reverse().map((e) => (
          <li key={e.id}>
            <div>
              {e.type === 'created'
                ? 'Ticket raised'
                : e.type === 'status_changed'
                  ? `${e.from_status ? STATUS_LABELS[e.from_status] : '?'} → ${e.to_status ? STATUS_LABELS[e.to_status] : '?'}`
                  : (e.note ?? '')}
            </div>
            <PhotoStrip photos={e.photos ?? []} />
            <div className="muted small">
              {e.actor_name ? `${e.actor_name} · ` : ''}
              {formatDate(e.created_at)}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
