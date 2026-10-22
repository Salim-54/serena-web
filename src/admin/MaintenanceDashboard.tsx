import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '../lib/auth';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import TechnicianList from '../components/TechnicianList';
import { formatDate } from '../lib/format';
import {
  type AdminTicket,
  type Department,
  type Technician,
  type TicketFilters,
  type TicketStats,
  downloadTicketReport,
  formatHours,
  formatPercent,
  listDepartments,
  listTechnicians,
  listTicketsPage,
  ticketStats,
  watchAllTickets,
} from '../lib/maintenance';
import { permissionsFor } from '../lib/permissions';
import { CATEGORIES, PRIORITIES, type TicketStatus } from '../lib/tickets';
import { addDays, isoDate } from '../lib/utilities';

// Maintenance dashboard. One filter row scopes everything below it; the
// filtering, counts, averages, reopen frequency, breakdowns and the Excel
// report are all computed by the API for the same filters.

type StatusGroup = 'all' | 'open' | 'active' | 'resolved' | 'closed' | 'cancelled';

const GROUPS: { key: StatusGroup; label: string; statuses: TicketStatus[] | null }[] = [
  { key: 'all', label: 'All tickets', statuses: null },
  { key: 'open', label: 'New / unassigned', statuses: ['open'] },
  { key: 'active', label: 'In progress', statuses: ['assigned', 'in_progress', 'on_hold'] },
  { key: 'resolved', label: 'Awaiting approval', statuses: ['resolved'] },
  { key: 'closed', label: 'Closed', statuses: ['closed'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
];

const PRESETS: { key: string; label: string; days: number | null }[] = [
  { key: '1', label: 'Today', days: 1 },
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
];

interface Filters {
  preset: string | null;
  from: string | null;
  to: string | null;
  group: StatusGroup;
  department: string;
  technician: string;
  priority: string;
  category: string;
  search: string;
}

// Remembered while the tab is open, so returning from a ticket keeps the view.
let savedFilters: Filters | null = null;

function initialFilters(): Filters {
  const today = isoDate(new Date());
  return { preset: '30', from: addDays(today, -29), to: today, group: 'all', department: '', technician: '', priority: '', category: '', search: '' };
}

const PAGE = 50;

export default function MaintenanceDashboard({ session }: { session: Session }) {
  const perms = permissionsFor(session);
  const [f, setF] = useState<Filters>(() => savedFilters ?? initialFilters());
  const [search, setSearch] = useState(f.search);
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [groupCounts, setGroupCounts] = useState<Record<TicketStatus, number> | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback(
    (patch: Partial<Filters>) =>
      setF((prev) => {
        const next = { ...prev, ...patch };
        savedFilters = next;
        return next;
      }),
    [],
  );

  // Debounce typing in the search box.
  useEffect(() => {
    const t = setTimeout(() => set({ search }), 350);
    return () => clearTimeout(t);
  }, [search, set]);

  const base: TicketFilters = useMemo(
    () => ({ from: f.from, to: f.to, departmentId: f.department, technician: f.technician, priority: f.priority, category: f.category, search: f.search }),
    [f.from, f.to, f.department, f.technician, f.priority, f.category, f.search],
  );
  const group = GROUPS.find((g) => g.key === f.group)!;
  const scoped: TicketFilters = useMemo(() => ({ ...base, status: group.statuses ?? undefined }), [base, group]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [list, s, all] = await Promise.all([
          listTicketsPage(scoped, 1, PAGE * page),
          ticketStats(scoped),
          // Counts for every status tile (same filters minus the status group).
          group.statuses ? ticketStats(base) : Promise.resolve(null),
        ]);
        setTickets(list.data);
        setTotal(list.total);
        setStats(s);
        setGroupCounts((all ?? s).byStatus);
        setError(null);
      } catch (e) {
        setError((e as Error).message || 'Could not load tickets.');
      }
      setLoading(false);
    },
    [scoped, base, group, page],
  );

  useEffect(() => {
    load();
    return watchAllTickets(() => load(true));
  }, [load]);

  useEffect(() => {
    listTechnicians().then(setTechnicians).catch(() => {});
    listDepartments().then(setDepartments).catch(() => {});
  }, []);

  const countFor = (g: (typeof GROUPS)[number]) =>
    !groupCounts ? null : g.statuses ? g.statuses.reduce((n, s) => n + (groupCounts[s] ?? 0), 0) : Object.values(groupCounts).reduce((a, b) => a + b, 0);

  async function exportReport() {
    setExporting(true);
    try {
      await downloadTicketReport(scoped);
    } catch (e) {
      setError(`Could not generate the report: ${(e as Error).message}`);
    }
    setExporting(false);
  }

  const r = stats?.reopens;

  return (
    <>
      <div className="page-head">
        <h2>Maintenance</h2>
        <div className="actions" style={{ marginTop: 0 }}>
          {perms.tickets.technicians && (
            <a className="btn ghost small" href="#/maintenance/technicians">
              Technicians
            </a>
          )}
          {perms.tickets.exportReport && (
            <button className="btn ghost small" onClick={exportReport} disabled={exporting || !total}>
              {exporting ? 'Generating…' : '⬇ Export report'}
            </button>
          )}
          {perms.tickets.create && (
            <a className="btn primary small" href="#/maintenance/new">
              + Raise ticket
            </a>
          )}
        </div>
      </div>

      <div className="card filters">
        <div className="seg" role="group" aria-label="Date range">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className={f.preset === p.key ? 'active' : ''}
              onClick={() => {
                const today = isoDate(new Date());
                setPage(1);
                set({ preset: p.key, from: p.days ? addDays(today, -(p.days - 1)) : null, to: p.days ? today : null });
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="inline">
          From
          <input type="date" value={f.from ?? ''} max={f.to ?? undefined} onChange={(e) => set({ preset: null, from: e.target.value || null })} />
        </label>
        <label className="inline">
          To
          <input type="date" value={f.to ?? ''} min={f.from ?? undefined} onChange={(e) => set({ preset: null, to: e.target.value || null })} />
        </label>
        <select value={f.department} onChange={(e) => set({ department: e.target.value })} aria-label="Department">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select value={f.technician} onChange={(e) => set({ technician: e.target.value })} aria-label="Technician">
          <option value="">All technicians</option>
          <option value="none">Unassigned</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={f.priority} onChange={(e) => set({ priority: e.target.value })} aria-label="Priority">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={f.category} onChange={(e) => set({ category: e.target.value })} aria-label="Category">
          <option value="">Any category</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input className="search" type="search" placeholder="Search ticket, room, name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {(f.department || f.technician || f.priority || f.category || f.search) && (
          <button
            className="btn ghost small"
            onClick={() => {
              setSearch('');
              set({ department: '', technician: '', priority: '', category: '', search: '' });
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className={loading && tickets ? 'refetching' : ''}>
        <div className="tiles" role="tablist" aria-label="Status">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              role="tab"
              aria-selected={f.group === g.key}
              className={`tile ${f.group === g.key ? 'active' : ''}`}
              onClick={() => {
                setPage(1);
                set({ group: g.key });
              }}
            >
              <span className="tile-value">{countFor(g) ?? '–'}</span>
              <span className="tile-label">{g.label}</span>
            </button>
          ))}
        </div>

        <div className="kpis">
          <div className="card kpi">
            <span className="kpi-value">{formatHours(stats?.avgHoursToAssign ?? null)}</span>
            <span className="muted small">Average time to assign</span>
          </div>
          <div className="card kpi">
            <span className="kpi-value">{formatHours(stats?.avgHoursToResolve ?? null)}</span>
            <span className="muted small">Average time to resolve</span>
          </div>
          <div className="card kpi">
            <span className="kpi-value">{formatPercent(r?.rate ?? null)}</span>
            <span className="muted small">
              Reopen rate · {r?.ticketsReopened ?? 0} of {r?.ticketsFixed ?? 0} fixed tickets came back
              {r && r.totalReopens > r.ticketsReopened && ` (${r.totalReopens} reopens in total)`}
            </span>
          </div>
          <div className="card kpi">
            <span className="kpi-value">{stats?.urgentOpen ?? 0}</span>
            <span className="muted small">Urgent & still open</span>
          </div>
        </div>

        {stats && stats.total > 0 && (
          <div className="breakdowns">
            <Breakdown title="By department" rows={stats.byDepartment} />
            <Breakdown title="By category" rows={stats.byCategory} />
            <Breakdown title="By technician" rows={stats.byTechnician} />
          </div>
        )}

        <section className="card history">
          <h3>
            {group.label} <span className="muted small">({total})</span>
          </h3>
          {tickets === null && !error && <p className="muted">Loading…</p>}
          {tickets !== null && tickets.length === 0 && <p className="muted empty">No tickets match these filters.</p>}
          {tickets && tickets.length > 0 && (
            <table className="ticket-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Problem</th>
                  <th>Department</th>
                  <th>Technician</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Raised</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} onClick={() => (window.location.hash = `/maintenance/tickets/${t.id}`)}>
                    <td className="mono">
                      <a href={`#/maintenance/tickets/${t.id}`}>{t.number}</a>
                    </td>
                    <td className="wrap">
                      <strong>{t.title}</strong>
                      <div className="muted small">
                        {t.location} · {t.requester_name}
                        {t.reopen_count > 0 && ` · reopened ×${t.reopen_count}`}
                      </div>
                    </td>
                    <td>{t.dept?.name ?? '—'}</td>
                    <td className="wrap-sm">
                      <TechnicianList technicians={t.technicians} empty="Unassigned" />
                    </td>
                    <td>
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="muted small">{formatDate(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tickets && tickets.length < total && (
            <div className="actions">
              <button className="btn ghost small" onClick={() => setPage((p) => p + 1)} disabled={loading}>
                Show more ({total - tickets.length} more)
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/** Ranked counts as thin single-colour bars, every value labelled. */
function Breakdown({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  const shown = rows.slice(0, 8);
  const rest = rows.slice(8).reduce((s, r) => s + r.count, 0);
  return (
    <section className="card breakdown">
      <h3>{title}</h3>
      <ul>
        {[...shown, ...(rest ? [{ name: 'Other', count: rest }] : [])].map((r) => (
          <li key={r.name} title={`${r.name}: ${r.count}`}>
            <span className="bd-name">{r.name}</span>
            <span className="bd-bar">
              <span style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
            <span className="bd-value">{r.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
