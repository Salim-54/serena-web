import { useEffect, useState } from 'react';
import { logout, restoreSession, type Session } from './lib/auth';
import { onAuthProblem } from './lib/api';
import { navigate, useRoute } from './lib/router';
import Login from './pages/Login';
import TicketList from './pages/TicketList';
import NewTicket from './pages/NewTicket';
import TicketDetail from './pages/TicketDetail';
import ChangePassword from './pages/ChangePassword';
import AdminApp from './admin/AdminApp';
import { InstallButton, IosInstallHint, OfflineBanner } from './components/InstallApp';
import UpdateBanner from './components/UpdateBanner';
import { permissionsFor, sessionLabel } from './lib/permissions';

export default function App() {
  // undefined = still restoring the session from the stored refresh token.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const route = useRoute();

  useEffect(() => {
    restoreSession()
      .then(setSession)
      .catch(() => {
        setNotice("Couldn't reach the server — check your connection.");
        setSession(null);
      });
    return onAuthProblem((reason) => {
      if (reason === 'expired') {
        setNotice('Your session ended — please sign in again.');
        setSession(null);
      } else {
        setSession((s) => (s ? { ...s, mustChangePassword: true } : s));
      }
    });
  }, []);

  useEffect(() => {
    document.title = !session ? 'RM Utility Portal' : permissionsFor(session).console ? 'RM Utility' : 'Maintenance Requests';
  }, [session]);

  if (session === undefined) return <div className="login-wrap muted">Loading…</div>;

  if (!session)
    return (
      <>
        <OfflineBanner />
        <UpdateBanner />
        {notice && <div className="update-banner">{notice}</div>}
        <Login
          onLogin={(s) => {
            setNotice(null);
            setSession(s);
          }}
        />
        <IosInstallHint />
      </>
    );

  if (session.mustChangePassword) return <ChangePassword required onChanged={setSession} />;
  if (route === '/account/password') return <ChangePassword required={false} onChanged={(s) => (setSession(s), navigate('/'))} onCancel={() => navigate('/')} />;

  const isConsole = permissionsFor(session).console;
  let page;
  if (isConsole || session.kind !== 'department') {
    page = <AdminApp session={session} />;
  } else {
    const detail = route.match(/^\/tickets\/(\d+)$/);
    if (route === '/new') page = <NewTicket session={session} />;
    else if (detail) page = <TicketDetail session={session} id={detail[1]} />;
    else page = <TicketList session={session} />;
  }

  return (
    <>
      <OfflineBanner />
      <UpdateBanner />
      <header className="topbar">
        <a className="brand" href="#/">
          <img src="/logo.png" alt="" />
          <span>{isConsole ? 'RM Utility' : 'Maintenance Requests'}</span>
        </a>
        <div className="topbar-right">
          <InstallButton />
          <span className="dept">{sessionLabel(session)}</span>
          <a className="btn ghost small" href="#/account/password">
            Password
          </a>
          <button
            className="btn ghost small"
            onClick={async () => {
              await logout();
              setSession(null);
              navigate('/');
            }}
          >
            Log out
          </button>
        </div>
      </header>
      <main className={isConsole ? 'container wide' : 'container'}>{page}</main>
      <IosInstallHint />
    </>
  );
}
