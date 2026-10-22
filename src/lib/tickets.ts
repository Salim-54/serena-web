import { get, getAll, post } from './api';
import { poll } from './poll';

// Tickets on the RM Utility API. Responses are mapped to the shapes the
// screens use (snake_case dates etc.), so the UI stays independent of the
// wire format. The server scopes department logins to their own tickets and
// enforces every workflow rule; actions just call the endpoints.

export type TicketStatus = 'open' | 'assigned' | 'in_progress' | 'on_hold' | 'resolved' | 'closed' | 'cancelled';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface TicketTechnician {
  id: number;
  name: string;
  phone: string | null;
}

export interface Department {
  id: number;
  name: string;
  kind?: 'standard' | 'administration' | 'maintenance';
}

export interface Ticket {
  id: number;
  number: string;
  created_at: string;
  updated_at: string;
  title: string;
  description: string | null;
  location: string;
  category: string;
  priority: Priority;
  status: TicketStatus;
  requester_name: string;
  photos: string[];
  assigned_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  /** One or more technicians; phone numbers are shown to everyone who can see the ticket. */
  technicians: TicketTechnician[];
  department: number;
  dept: Department | null;
  /** Times it came back after being fixed. */
  reopen_count: number;
  /** Raised by admin or staff — only then may times be set by hand. */
  allows_custom_times: boolean;
  /** Who last adjusted the times by hand (the API sends it to admins only). */
  times_edited_by: string | null;
  times_edited_at: string | null;
}

export interface TicketEvent {
  id: number;
  created_at: string;
  type: 'created' | 'assigned' | 'status_changed' | 'note' | 'edited';
  from_status: TicketStatus | null;
  to_status: TicketStatus | null;
  note: string | null;
  actor_name: string | null;
  photos?: string[] | null;
}

// ---- wire format ---------------------------------------------------------

export interface ApiTicket {
  id: number;
  number: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  description: string | null;
  location: string;
  category: string;
  priority: Priority;
  status: TicketStatus;
  requesterName: string;
  photos: string[];
  assignedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  technicians: { id: number; name: string; phone: string | null }[];
  departmentId: number;
  department?: Department | null;
  reopenCount?: number;
  allowsCustomTimes?: boolean;
  timesEditedByName?: string | null;
  timesEditedAt?: string | null;
}

interface ApiEvent {
  id: number;
  createdAt: string;
  type: TicketEvent['type'];
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus | null;
  note: string | null;
  actorName: string | null;
  photos: string[];
}

export function fromApiTicket(t: ApiTicket): Ticket {
  return {
    id: t.id,
    number: t.number,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    title: t.title,
    description: t.description,
    location: t.location,
    category: t.category,
    priority: t.priority,
    status: t.status,
    requester_name: t.requesterName,
    photos: t.photos ?? [],
    assigned_at: t.assignedAt,
    resolved_at: t.resolvedAt,
    closed_at: t.closedAt,
    technicians: [...(t.technicians ?? [])].map((x) => ({ id: x.id, name: x.name, phone: x.phone })).sort((a, b) => a.name.localeCompare(b.name)),
    department: t.departmentId,
    dept: t.department ? { id: t.department.id, name: t.department.name, kind: t.department.kind } : null,
    reopen_count: t.reopenCount ?? 0,
    allows_custom_times: t.allowsCustomTimes ?? false,
    times_edited_by: t.timesEditedByName ?? null,
    times_edited_at: t.timesEditedAt ?? null,
  };
}

export const fromApiEvent = (e: ApiEvent): TicketEvent => ({
  id: e.id,
  created_at: e.createdAt,
  type: e.type,
  from_status: e.fromStatus,
  to_status: e.toStatus,
  note: e.note,
  actor_name: e.actorName,
  photos: e.photos,
});

// ---- labels & helpers ----------------------------------------------------

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In progress',
  on_hold: 'On hold',
  resolved: 'Fixed – please confirm',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export const CATEGORIES = [
  'General',
  'Electrical',
  'Plumbing',
  'HVAC / Air conditioning',
  'Carpentry & Furniture',
  'Painting',
  'Appliances',
  'TV / Phone / IT',
  'Other',
];

export const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];

export const ticketNumber = (id: number) => `MT-${String(id).padStart(5, '0')}`;

/** "Janvier, Sulaiman", or null when unassigned. */
export const technicianNames = (t: Pick<Ticket, 'technicians'>) =>
  t.technicians.length ? t.technicians.map((x) => x.name).join(', ') : null;

// ---- department pages ----------------------------------------------------

/** The signed-in department's tickets (the server scopes the list;
 * Administration gets every department's). */
export async function listTickets(): Promise<Ticket[]> {
  return (await getAll<ApiTicket>('/tickets')).map(fromApiTicket);
}

export async function getTicket(id: string | number): Promise<Ticket | null> {
  try {
    return fromApiTicket(await get<ApiTicket>(`/tickets/${id}`));
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

export async function listEvents(ticketId: number): Promise<TicketEvent[]> {
  return (await get<ApiEvent[]>(`/tickets/${ticketId}/events`)).map(fromApiEvent);
}

export interface NewTicket {
  title: string;
  description: string;
  location: string;
  category: string;
  priority: Priority;
  requester_name: string;
}

/** Raise a ticket; returns its id. Photos are added afterwards (named after
 * the number). [raisedAt] (ISO): raised earlier — admin/staff only. */
export async function createTicket(t: NewTicket, departmentId?: number, raisedAt?: string | null): Promise<number> {
  const created = await post<ApiTicket>('/tickets', {
    title: t.title,
    description: t.description || undefined,
    location: t.location,
    category: t.category,
    priority: t.priority,
    requesterName: t.requester_name,
    ...(departmentId ? { departmentId } : {}),
    ...(raisedAt ? { raisedAt } : {}),
  });
  return created.id;
}

/** Adds already-uploaded request photos to a ticket. */
export async function appendTicketPhotos(ticketId: number, urls: string[]) {
  if (urls.length) await post(`/tickets/${ticketId}/photos`, { photos: urls });
}

/** Requesting department confirms the fix. */
export async function approve(ticket: Ticket, requesterName: string, note?: string) {
  await post(`/tickets/${ticket.id}/approve`, { requesterName, ...(note?.trim() ? { note: note.trim() } : {}) });
}

/** Requesting department says it isn't fixed. */
export async function reject(ticket: Ticket, requesterName: string, reason: string) {
  await post(`/tickets/${ticket.id}/reject`, { requesterName, reason: reason.trim() });
}

export async function cancel(ticket: Ticket, requesterName: string, reason?: string) {
  await post(`/tickets/${ticket.id}/cancel`, { requesterName, ...(reason?.trim() ? { reason: reason.trim() } : {}) });
}

/** Statuses Administration may reopen another department's ticket from. */
export const REOPENABLE: TicketStatus[] = ['resolved', 'closed'];

/** Administration reopens another department's ticket (back to maintenance, with the reason). */
export async function reopen(ticket: Ticket, requesterName: string, reason: string) {
  await post(`/tickets/${ticket.id}/reopen`, { requesterName, reason: reason.trim() });
}

/** Refreshes [onChange] periodically (replaces realtime). */
export function watchTickets(onChange: () => void) {
  return poll(onChange, 30_000);
}
