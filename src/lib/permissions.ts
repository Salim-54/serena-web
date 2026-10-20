import type { Session } from './auth';

// What the signed-in login may do, derived from the permissions the API
// returns (backend: src/common/permissions.ts). The server enforces all of
// this; the UI only uses it to show the right screens and buttons.

export interface Permissions {
  /** Uses the console (tabs) instead of the department request pages. */
  console: boolean;
  tickets: {
    viewAll: boolean;
    /** Full management: edit, any status, technicians any time, delete. */
    manage: boolean;
    /** Supervisor workflow: status changes per the workflow table. */
    workflow: boolean;
    create: boolean;
    exportReport: boolean;
    technicians: boolean;
    raiseAs: Session['raiseAs'];
  };
  utilities: {
    recording: boolean;
    difference: boolean;
    analytics: 'none' | 'read' | 'full';
    exportReadings: boolean;
  };
  /** Who recorded each reading (admins). */
  seeRecordedBy: boolean;
}

export function permissionsFor(s: Session): Permissions {
  const has = (p: string) => s.permissions.includes(p);
  const manage = has('tickets.manage');
  const workflow = has('tickets.workflow');
  return {
    console: has('tickets.view_all') || has('readings.view') || has('analytics.read'),
    tickets: {
      viewAll: has('tickets.view_all'),
      manage,
      workflow: workflow && !manage,
      create: has('tickets.create'),
      exportReport: has('tickets.export'),
      technicians: has('technicians.manage'),
      raiseAs: s.raiseAs,
    },
    utilities: {
      recording: has('readings.record'),
      difference: has('readings.difference'),
      analytics: has('analytics.read') ? (has('readings.unrestricted') ? 'full' : 'read') : 'none',
      exportReadings: has('readings.export'),
    },
    seeRecordedBy: has('readings.audit'),
  };
}

/** Name written on timelines for console actions (the server records the user too). */
export const actorName = (s: Session) => s.name;

/** Header label, e.g. "Agnes · Maintenance". */
export function sessionLabel(s: Session): string {
  if (s.kind === 'department') return s.departmentName;
  const role = { admin: 'Admin', staff: 'Maintenance', supervisor: 'Supervisor' }[s.kind];
  return `${s.name} · ${role}`;
}

/** Statuses a supervisor may set from [from] (mirrors the backend's workflow table). */
export const SUPERVISOR_TRANSITIONS: Record<string, string[]> = {
  open: ['cancelled'],
  assigned: ['in_progress', 'on_hold', 'cancelled'],
  in_progress: ['on_hold', 'resolved'],
  on_hold: ['in_progress', 'resolved'],
  resolved: ['in_progress'],
  closed: [],
  cancelled: [],
};
