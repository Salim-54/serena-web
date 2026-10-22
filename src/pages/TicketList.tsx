import { useCallback, useEffect, useState } from 'react';
import type { DepartmentSession } from '../lib/auth';
import { navigate } from '../lib/router';
import { listTickets, ticketNumber, watchTickets, type Ticket } from '../lib/tickets';
import TechnicianList from '../components/TechnicianList';
import { formatDate } from '../lib/format';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { addDays, isoDate } from '../lib/utilities';
import { permissionsFor } from '../lib/permissions';

// Department request list. Administration sees every department's tickets
// here (filter / sort by department); "Needs your approval" is always the
// login's own tickets.

type Filter = 'action' | 'active' | 'done' | 'all';

const FILTERS: { key: Filter; label: string; test: (t: Ticket) => boolean }[] = [
  { key: 'action', label: 'Needs your approval', test: (t) => t.status === 'resolved' },
  { key: 'active', label: 'In progress', test: (t) => ['open', 'assigned', 'in_progress', 'on_hold'].includes(t.status) },
  { key: 'done', label: 'Closed', test: (t) => t.status === 'closed' || t.status === 'cancelled' },
  { key: 'all', label: 'All', test: () => true },
];

// When the request was raised. Combines with the status tabs; the counts
// follow it.
type Period = 'all' | 'today' | '7' | '30' | 'month' | 'custom';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Dates…' },
];

interface TimeFilter {
  period: Period;
  from: string;
  to: string;
}

// Remembered while the tab is open, so coming back from a ticket keeps it.
let savedTime: TimeFilter = { period: 'all', from: '', to: '' };
let savedDept = '';
let savedSort: 'newest' | 'department' = 'newest';

/** Inclusive local-date range for a period ('' = unbounded). */
function rangeOf(f: TimeFilter): { from: string; to: string } {
  const today = isoDate(new Date());
  switch (f.period) {
    case 'today':
      return { from: today, to: today };
    case '7':
      return { from: addDays(today, -6), to: today };
    case '30':
      return { from: addDays(today, -29), to: today };
    case 'month':
      return { from: today.slice(0, 8) + '01', to: today };
    case 'custom':
      return { from: f.from, to: f.to };
    default:
      return { from: '', to: '' };
  }
}

export default function TicketList({ session }: { session: DepartmentSession }) {
  const allDepartments = permissionsFor(session).tickets.viewAll;
  const scope = allDepartments ? null : session.departmentId;
  const isOwn = (t: Ticket) => !allDepartments || String(t.department) === session.departmentId;
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [dept, setDeptState] = useState(savedDept);
  const [sort, setSortState] = useState(savedSort);
  const setDept = (d: string) => setDeptState((savedDept = d));
  const setSort = (v: typeof sort) => setSortState((savedSort = v));
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('active');
  const [time, setTimeState] = useState<TimeFilter>(savedTime);
  const setTime = (patch: Partial<TimeFilter>) =>
    setTimeState((prev) => (savedTime = { ...prev, ...patch }));

  const load = useCallback(async () => {
    try {
      const data = await listTickets();
      setTickets(data);
      setError(null);
      // Land on approvals first when there are any waiting.
      const own = (t: Ticket) => scope !== null || String(t.department) === session.departmentId;
      setFilter((f) => (f === 'active' && data.some((t) => t.status === 'resolved' && own(t)) ? 'action' : f));
    } catch {
      setError('Could not load tickets.');
    }
  }, [scope, session.departmentId]);

  useEffect(() => {
    load();
    return watchTickets(load);
  }, [load, scope]);

  // Departments present in the list, for the filter (Administration).
  const departments = [...new Map((tickets ?? []).map((t) => [String(t.department), t.dept?.name ?? '—'])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const testOf = (f: (typeof FILTERS)[number]) => (f.key === 'action' ? (t: Ticket) => f.test(t) && isOwn(t) : f.test);

  const range = rangeOf(time);
  const inRange = (t: Ticket) => {
    const day = isoDate(new Date(t.created_at));
    return (!range.from || day >= range.from) && (!range.to || day <= range.to);
  };
  const inTime = (tickets ?? []).filter((t) => inRange(t) && (!dept || String(t.department) === dept));
  const current = FILTERS.find((f) => f.key === filter)!;
  const visible = inTime.filter(testOf(current));
  if (allDepartments && sort === 'department') {
    // Stable: newest first within each department.
    visible.sort((a, b) => (a.dept?.name ?? '').localeCompare(b.dept?.name ?? ''));
  }

  return (
    <>
      <div className="page-head">
        <h2>{allDepartments ? 'All requests' : 'Our requests'}</h2>
        <button className="btn primary" onClick={() => navigate('/new')}>
          + New request
        </button>
      </div>

      <div className="time-filter">
        <div className="seg" role="group" aria-label="Raised">
          {PERIODS.map((p) => (
            <button key={p.key} className={time.period === p.key ? 'active' : ''} onClick={() => setTime({ period: p.key })}>
              {p.label}
            </button>
          ))}
        </div>
        {allDepartments && (
          <div className="time-range">
            <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
              <option value="">All departments</option>
              {departments.map(([id, name]) => (
                <option key={id} value={id}>
                  {id === session.departmentId ? `${name} (us)` : name}
                </option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
              <option value="newest">Newest first</option>
              <option value="department">By department</option>
            </select>
          </div>
        )}
        {time.period === 'custom' && (
          <div className="time-range">
            <label className="inline">
              From
              <input type="date" value={time.from} max={time.to || undefined} onChange={(e) => setTime({ from: e.target.value })} />
            </label>
            <label className="inline">
              To
              <input type="date" value={time.to} min={time.from || undefined} onChange={(e) => setTime({ to: e.target.value })} />
            </label>
          </div>
        )}
      </div>

      <div className="tabs">
        {FILTERS.map((f) => {
          const count = inTime.filter(testOf(f)).length;
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
      {tickets !== null && visible.length === 0 && (
        <p className="muted empty">
          {time.period === 'all' ? 'Nothing here.' : 'Nothing raised in this period.'}
          {time.period !== 'all' && (
            <>
              {' '}
              <button className="link-btn" onClick={() => setTime({ period: 'all' })}>Show all time</button>
            </>
          )}
        </p>
      )}

      <ul className="ticket-list">
        {visible.map((t) => (
          <li key={t.id}>
            <a className="card ticket-row" href={`#/tickets/${t.id}`}>
              <div className="row-top">
                <span className="muted mono">{ticketNumber(t.id)}</span>
                {allDepartments && <span className="small dept-tag">{t.dept?.name ?? '—'}</span>}
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
