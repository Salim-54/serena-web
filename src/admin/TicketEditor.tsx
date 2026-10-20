import { useEffect, useState } from 'react';
import type { Session } from '../lib/auth';
import TicketForm from '../components/TicketForm';
import { getAdminTicket, listDepartments, updateDetails, type AdminTicket, type Department } from '../lib/maintenance';
import { permissionsFor } from '../lib/permissions';
import { navigate } from '../lib/router';
import { createTicket, ticketNumber } from '../lib/tickets';

/**
 * Console: raise a ticket (no id) or edit one (id). Where a new ticket is
 * filed is decided by the server from the login: admins choose; department
 * logins (e.g. Administration) file under their own department; maintenance
 * staff under Maintenance.
 */
export default function TicketEditor({ session, id }: { session: Session; id?: string }) {
  const raiseAs = permissionsFor(session).tickets.raiseAs;
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [ticket, setTicket] = useState<AdminTicket | null | undefined>(id ? undefined : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDepartments().then(setDepartments).catch(() => setError('Could not load departments.'));
    if (id) getAdminTicket(id).then(setTicket).catch(() => setError('Could not load this ticket.'));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!departments || ticket === undefined) return <p className="muted">Loading…</p>;
  if (id && !ticket) return <p className="muted">Ticket not found.</p>;

  // Editing: ticket managers can correct the department too.
  const showPicker = Boolean(ticket) || raiseAs === 'choose';
  const filedUnder = raiseAs === 'maintenance' ? 'Maintenance' : session.kind === 'department' ? session.departmentName : undefined;

  return (
    <>
      <div className="page-head">
        <h2>{ticket ? `Edit ${ticketNumber(ticket.id)}` : 'Raise a ticket'}</h2>
      </div>
      <TicketForm
        draftKey={ticket ? `edit-ticket:${ticket.id}` : `console-new-ticket:${session.kind}`}
        departments={showPicker ? departments : undefined}
        filedUnder={showPicker ? undefined : filedUnder}
        ticketId={ticket?.id}
        initial={
          ticket
            ? { ...ticket, description: ticket.description ?? '', department: ticket.department }
            : { requester_name: session.kind === 'department' ? '' : session.name }
        }
        submitLabel={ticket ? 'Save changes' : 'Create ticket'}
        onCancelHref={ticket ? `#/maintenance/tickets/${ticket.id}` : '#/maintenance'}
        onSubmit={async (v) => {
          if (ticket) {
            await updateDetails(ticket, { ...v, department: v.department ?? ticket.department });
            return ticket.id;
          }
          if (showPicker && v.department == null) throw new Error('Pick a department.');
          return createTicket(v, showPicker ? v.department! : undefined);
        }}
        onDone={(ticketId) => navigate(`/maintenance/tickets/${ticketId}`)}
      />
    </>
  );
}
