import { useCallback, useEffect, useState } from 'react';
import { lastRequesterName, rememberRequesterName, type DepartmentSession } from '../lib/auth';
import { useDraft } from '../lib/drafts';
import { formatDate } from '../lib/format';
import {
  STATUS_LABELS,
  approve,
  cancel,
  getTicket,
  listEvents,
  reject,
  ticketNumber,
  watchTickets,
  type Ticket,
  type TicketEvent,
} from '../lib/tickets';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import TechnicianList from '../components/TechnicianList';
import PhotoStrip from '../components/PhotoStrip';

type Action = 'approve' | 'reject' | 'cancel';

export default function TicketDetail({ session, id }: { session: DepartmentSession; id: string }) {
  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  // The open approve/reject/cancel box and its comment survive a refresh.
  const [pendingAction, setPendingAction, actionDraft] = useDraft<{ action: Action | null; note: string }>(
    `ticket-action:${id}`,
    { action: null, note: '' },
  );
  const action = pendingAction.action;
  const note = pendingAction.note;
  const setAction = (a: Action | null) => setPendingAction((p) => ({ ...p, action: a }));
  const setNote = (n: string) => setPendingAction((p) => ({ ...p, note: n }));
  const [name, setName] = useState(lastRequesterName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await getTicket(id);
      setTicket(t);
      if (t) setEvents(await listEvents(t.id));
    } catch {
      setError('Could not load this ticket.');
    }
  }, [id, session.departmentId]);

  useEffect(() => {
    load();
    return watchTickets(load);
  }, [load, session.departmentId]);

  if (ticket === undefined) return <p className="muted">Loading…</p>;
  if (ticket === null) return <p className="muted">Ticket not found. <a href="#/">Back</a></p>;

  async function submit() {
    if (!ticket || !action) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'approve') await approve(ticket, name, note);
      if (action === 'reject') await reject(ticket, name, note);
      if (action === 'cancel') await cancel(ticket, name, note);
      rememberRequesterName(name);
      actionDraft.discard();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  const canCancel = ticket.status === 'open' || ticket.status === 'assigned';
  const noteRequired = action === 'reject';

  return (
    <>
      <div className="page-head">
        <a href="#/" className="back">← Our requests</a>
      </div>

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
          <dt>Location</dt>
          <dd>{ticket.location}</dd>
          <dt>Category</dt>
          <dd>{ticket.category}</dd>
          <dt>Requested by</dt>
          <dd>{ticket.requester_name}</dd>
          <dt>Raised</dt>
          <dd>{formatDate(ticket.created_at)}</dd>
          <dt>{ticket.technicians.length > 1 ? 'Technicians' : 'Technician'}</dt>
          <dd>
            <TechnicianList technicians={ticket.technicians} />
          </dd>
        </dl>

        {ticket.photos.length > 0 && (
          <PhotoStrip photos={ticket.photos} size={96} />
        )}

        {ticket.status === 'resolved' && action === null && (
          <div className="callout">
            <p>Maintenance marked this as fixed. Please check and confirm.</p>
            <div className="actions">
              <button className="btn primary" onClick={() => setAction('approve')}>Yes, it's fixed</button>
              <button className="btn danger" onClick={() => setAction('reject')}>Not fixed</button>
            </div>
          </div>
        )}

        {canCancel && action === null && (
          <div className="actions">
            <button className="btn ghost small" onClick={() => setAction('cancel')}>Cancel request</button>
          </div>
        )}

        {action && (
          <div className="callout">
            <p>
              {action === 'approve' && 'Confirm the issue is fixed. This closes the ticket.'}
              {action === 'reject' && 'Tell maintenance what is still wrong. The ticket goes back to them.'}
              {action === 'cancel' && 'Cancel this request?'}
            </p>
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              {noteRequired ? "What's still wrong?" : 'Comment (optional)'}
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="actions">
              <button
                className={`btn ${action === 'approve' ? 'primary' : 'danger'}`}
                disabled={busy || !name.trim() || (noteRequired && !note.trim())}
                onClick={submit}
              >
                {busy ? 'Saving…' : action === 'approve' ? 'Confirm fixed' : action === 'reject' ? 'Send back' : 'Cancel request'}
              </button>
              <button className="btn ghost" onClick={() => { setAction(null); setError(null); }} disabled={busy}>
                Back
              </button>
            </div>
          </div>
        )}
      </article>

      <h3>Timeline</h3>
      <ol className="timeline">
        {[...events].reverse().map((e) => (
          <li key={e.id}>
            <div>{describe(e)}</div>
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

function describe(e: TicketEvent): string {
  switch (e.type) {
    case 'created':
      return 'Request raised';
    case 'assigned':
      return e.note ?? 'Assigned';
    case 'status_changed':
      return `${e.from_status ? STATUS_LABELS[e.from_status] : '?'} → ${e.to_status ? STATUS_LABELS[e.to_status] : '?'}`;
    default:
      return e.note ?? '';
  }
}
