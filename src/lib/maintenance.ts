import { del, download, get, patch, post, put, type Paginated } from './api';
import { poll } from './poll';
import { type ApiTicket, type Department, type Priority, type Ticket, type TicketEvent, type TicketStatus, fromApiEvent, fromApiTicket } from './tickets';

// Console side of tickets: every department's tickets (for logins allowed
// to see them), management actions, technicians, stats and the report.

export type { Department };

export interface Technician {
  id: number;
  name: string;
  phone: string | null;
  trade: string | null;
  active: boolean;
}

export type AdminTicket = Ticket;

export const ALL_STATUSES: TicketStatus[] = ['open', 'assigned', 'in_progress', 'on_hold', 'resolved', 'closed', 'cancelled'];

/** Dashboard filters — passed straight to the API. */
export interface TicketFilters {
  from?: string | null;
  to?: string | null;
  status?: TicketStatus[];
  departmentId?: string;
  technician?: string;
  priority?: string;
  category?: string;
  search?: string;
}

const toQuery = (f: TicketFilters) => ({
  from: f.from ?? undefined,
  to: f.to ?? undefined,
  status: f.status?.length ? f.status.join(',') : undefined,
  departmentId: f.departmentId || undefined,
  technician: f.technician || undefined,
  priority: f.priority || undefined,
  category: f.category || undefined,
  search: f.search?.trim() || undefined,
});

export async function listTicketsPage(f: TicketFilters, page: number, limit = 50): Promise<{ data: AdminTicket[]; total: number }> {
  const res = await get<Paginated<ApiTicket>>('/tickets', { ...toQuery(f), page, limit });
  return { data: res.data.map(fromApiTicket), total: res.total };
}

export interface CountRow {
  name: string;
  count: number;
}

export interface TicketStats {
  total: number;
  byStatus: Record<TicketStatus, number>;
  avgHoursToAssign: number | null;
  avgHoursToResolve: number | null;
  reopens: {
    ticketsFixed: number;
    ticketsReopened: number;
    rate: number | null;
    totalReopens: number;
    avgPerReopenedTicket: number | null;
    once: number;
    twice: number;
    threeOrMore: number;
  };
  urgentOpen: number;
  byDepartment: CountRow[];
  byCategory: CountRow[];
  byTechnician: CountRow[];
  reopensByTechnician: CountRow[];
  reopensByDepartment: CountRow[];
}

export const ticketStats = (f: TicketFilters) => get<TicketStats>('/tickets/stats', toQuery(f));

/** Excel report (Summary + Tickets) built by the server for these filters. */
export const downloadTicketReport = (f: TicketFilters) => download('/tickets/report.xlsx', toQuery(f), 'RM_Maintenance_Report.xlsx');

export async function getAdminTicket(id: string): Promise<AdminTicket | null> {
  try {
    return fromApiTicket(await get<ApiTicket>(`/tickets/${id}`));
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

export async function listEvents(ticketId: number): Promise<TicketEvent[]> {
  return (await get<Parameters<typeof fromApiEvent>[0][]>(`/tickets/${ticketId}/events`)).map(fromApiEvent);
}

export const listDepartments = () => get<Department[]>('/departments');

interface ApiTechnician {
  id: number;
  name: string;
  phone: string | null;
  trade: string | null;
  isActive: boolean;
}

export async function listTechnicians(): Promise<Technician[]> {
  const list = await get<ApiTechnician[]>('/technicians', { includeInactive: true });
  return list.map((t) => ({ id: t.id, name: t.name, phone: t.phone, trade: t.trade, active: t.isActive }));
}

export async function saveTechnician(t: Omit<Technician, 'id'> & { id?: number }) {
  const body = { name: t.name.trim(), phone: t.phone?.trim() || '', trade: t.trade?.trim() || '' };
  if (t.id) await patch(`/technicians/${t.id}`, { ...body, isActive: t.active });
  else await post('/technicians', body);
}

/** Timeline note, optionally with photos. */
export async function addNote(ticketId: number, note: string, photos: string[] = []) {
  await post(`/tickets/${ticketId}/notes`, { ...(note.trim() ? { note: note.trim() } : {}), ...(photos.length ? { photos } : {}) });
}

/** Set exactly these technicians ([] = unassign). */
export async function setTechnicians(ticket: AdminTicket, technicianIds: number[]) {
  await put(`/tickets/${ticket.id}/technicians`, { technicianIds });
}

/** Status change with an optional note and photos (e.g. proof of the fix). */
export async function setStatus(ticket: AdminTicket, status: TicketStatus, note?: string, photos: string[] = []) {
  await post(`/tickets/${ticket.id}/status`, {
    status,
    ...(note?.trim() ? { note: note.trim() } : {}),
    ...(photos.length ? { photos } : {}),
  });
}

export interface TicketFields {
  title: string;
  description: string;
  location: string;
  category: string;
  priority: Priority;
  requester_name: string;
  photos: string[];
}

export async function updateDetails(ticket: AdminTicket, f: TicketFields & { department: number }) {
  await patch(`/tickets/${ticket.id}`, {
    title: f.title.trim(),
    description: f.description.trim(),
    location: f.location.trim(),
    category: f.category,
    priority: f.priority,
    requesterName: f.requester_name.trim(),
    photos: f.photos,
    departmentId: f.department,
  });
}

export async function deleteTicket(id: number) {
  await del(`/tickets/${id}`);
}

/** Periodic refresh (replaces realtime). */
export function watchAllTickets(onChange: () => void) {
  return poll(onChange, 30_000);
}

// ---- formatting ----------------------------------------------------------

export const formatPercent = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

export function formatHours(h: number | null): string {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} days`;
}

export const hoursBetween = (a: string | null, b: string | null) =>
  a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 36e5 : null;
