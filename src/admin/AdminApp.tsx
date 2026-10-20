import type { Session } from '../lib/auth';
import { permissionsFor } from '../lib/permissions';
import { useRoute } from '../lib/router';
import Recording from './Recording';
import Difference from './Difference';
import Analytics from './Analytics';
import MaintenanceDashboard from './MaintenanceDashboard';
import ManageTicket from './ManageTicket';
import TicketEditor from './TicketEditor';
import Technicians from './Technicians';

// The console: utilities (Recording / Difference / Analytics) and
// Maintenance (all tickets). Which tabs a login gets — and what it can do
// inside them — comes from the permissions the API returns:
//   admin          → everything
//   supervisor     → Recording (record window) · Difference · Maintenance (workflow)
//   staff          → Recording (record window) · Difference · Maintenance (no export)
//   Administration → Maintenance · Analytics (read-only)

function maintenancePage(route: string, session: Session) {
  const edit = route.match(/^\/maintenance\/tickets\/(\d+)\/edit$/);
  if (edit) return <TicketEditor key={edit[1]} session={session} id={edit[1]} />;
  const detail = route.match(/^\/maintenance\/tickets\/(\d+)$/);
  if (detail) return <ManageTicket key={detail[1]} session={session} id={detail[1]} />;
  if (route === '/maintenance/new') return <TicketEditor session={session} />;
  if (route === '/maintenance/technicians') return <Technicians />;
  return <MaintenanceDashboard session={session} />;
}

export default function AdminApp({ session }: { session: Session }) {
  const route = useRoute();
  const p = permissionsFor(session);
  const tabs = [
    p.utilities.recording && { path: '/recording', label: 'Recording' },
    p.utilities.difference && { path: '/difference', label: 'Difference' },
    p.utilities.analytics !== 'none' && { path: '/analytics', label: 'Analytics' },
    p.tickets.viewAll && { path: '/maintenance', label: 'Maintenance' },
  ].filter((t): t is { path: string; label: string } => Boolean(t));
  // Administration lands on Maintenance; others on their first tab.
  const fallback = session.kind === 'department' ? '/maintenance' : tabs[0].path;
  const current = tabs.find((t) => route.startsWith(t.path))?.path ?? fallback;

  return (
    <>
      <nav className="tabs admin-nav" aria-label="Sections">
        {tabs.map((t) => (
          <a key={t.path} href={`#${t.path}`} className={`tab ${current === t.path ? 'active' : ''}`}>
            {t.label}
          </a>
        ))}
      </nav>
      {current === '/recording' && <Recording session={session} />}
      {current === '/difference' && <Difference />}
      {current === '/analytics' && <Analytics session={session} />}
      {current === '/maintenance' && maintenancePage(route, session)}
    </>
  );
}
