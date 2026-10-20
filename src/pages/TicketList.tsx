import { useCallback, useEffect, useState } from 'react';
import type { DepartmentSession } from '../lib/auth';
import { navigate } from '../lib/router';
import { listTickets, ticketNumber, watchTickets, type Ticket } from '../lib/tickets';
import TechnicianList from '../components/TechnicianList';
import { formatDate } from '../lib/format';
import { PriorityBadge, StatusBadge } from '../components/Badges';

type Filter = 'action' | 'active' | 'done' | 'all';

const FILTERS: { key: Filter; label: string; test: (t: Ticket) => boolean }[] = [
  { key: 'action', label: 'Needs your approval', test: (t) => t.status === 'resolved' },
  { key: 'active', label: 'In progress', test: (t) => ['open', 'assigned', 'in_progress', 'on_hold'].includes(t.status) },
  { key: 'done', label: 'Closed', test: (t) => t.status === 'closed' || t.status === 'cancelled' },
  { key: 'all', label: 'All', test: () => true },
];

export default function TicketList({ session }: { session: DepartmentSession }) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('active');

  const load = useCallback(async () => {
    try {
      const data = await listTickets();
      setTickets(data);
      setError(null);
      // Land on approvals first when there are any waiting.
      setFilter((f) => (f === 'active' && data.some((t) => t.status === 'resolved') ? 'action' : f));
    } catch {
      setError('Could not load tickets.');
    }
  }, [session.departmentId]);

  useEffect(() => {
    load();
    return watchTickets(load);
  }, [load, session.departmentId]);

  const current = FILTERS.find((f) => f.key === filter)!;
  const visible = (tickets ?? []).filter(current.test);

  return (
    <>
      <div className="page-head">
        <h2>Our requests</h2>
        <button className="btn primary" onClick={() => navigate('/new')}>
          + New request
        </button>
      </div>

      <div className="tabs">
        {FILTERS.map((f) => {
          const count = (tickets ?? []).filter(f.test).length;
          return (
            <button
              key={f.key}
              className={`tab ${filter === f.key ? 'active' : ''} ${f.key === 'action' && count ? 'attention' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              {f.key !== 'all' && f.key !== 'done' && <span className="count">{count}</span>}
            </button>
          );
        })}
      </div>

      {error && <p className="error">{error}</p>}
      {tickets === null && !error && <p className="muted">Loading…</p>}
      {tickets !== null && visible.length === 0 && <p className="muted empty">Nothing here.</p>}

      <ul className="ticket-list">
        {visible.map((t) => (
          <li key={t.id}>
            <a className="card ticket-row" href={`#/tickets/${t.id}`}>
              <div className="row-top">
                <span className="muted mono">{ticketNumber(t.id)}</span>
                <span className="spacer" />
                {t.priority !== 'normal' && <PriorityBadge priority={t.priority} />}
                <StatusBadge status={t.status} />
              </div>
              <strong className="row-title">{t.title}</strong>
              <div className="muted small">
                {t.location} · {t.category} · by {t.requester_name} · {formatDate(t.created_at)}
              </div>
              {t.technicians.length > 0 && (
                <div className="small">
                  {t.technicians.length > 1 ? 'Technicians' : 'Technician'}: <TechnicianList technicians={t.technicians} inline callable={false} />
                </div>
              )}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
