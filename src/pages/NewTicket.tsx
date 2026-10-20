import { lastRequesterName, rememberRequesterName, type DepartmentSession } from '../lib/auth';
import { navigate } from '../lib/router';
import { createTicket } from '../lib/tickets';
import TicketForm from '../components/TicketForm';

export default function NewTicket({ session }: { session: DepartmentSession }) {
  return (
    <>
      <div className="page-head">
        <h2>New maintenance request</h2>
      </div>
      <TicketForm
        draftKey={`new-ticket:${session.departmentId}`}
        initial={{ requester_name: lastRequesterName() }}
        submitLabel="Submit request"
        onSubmit={async (v) => {
          const id = await createTicket(v);
          rememberRequesterName(v.requester_name);
          return id;
        }}
        onDone={(id) => navigate(`/tickets/${id}`)}
      />
    </>
  );
}
