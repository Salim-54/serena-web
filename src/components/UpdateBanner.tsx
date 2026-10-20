import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Registers the service worker and keeps everyone on the latest version.
// When a new deploy is found:
//   * nobody is typing → update right away (forms are kept as drafts and
//     restored after the reload, see lib/drafts.ts), so no one keeps using
//     — or exporting from — an old copy;
//   * someone is in a field → show "Update now / Later" instead.
// Checks for a new version every 30 minutes and whenever the app is
// brought back to the foreground.

const CHECK_EVERY_MS = 30 * 60 * 1000;

const isEditing = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
};

export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => registration.update().catch(() => {});
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    },
  });

  useEffect(() => {
    if (needRefresh && !isEditing()) updateServiceWorker(true);
  }, [needRefresh, updateServiceWorker]);

  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status">
      <span>A new version of the app is available.</span>
      <button className="btn primary small" onClick={() => updateServiceWorker(true)}>
        Update now
      </button>
      <button className="btn ghost small" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  );
}
