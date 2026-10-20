import { useEffect, useState } from 'react';

// "Install app" support for the PWA.
// - Chrome/Edge/Android: capture `beforeinstallprompt` and offer a button.
// - iPhone/iPad Safari has no install prompt: show a one-time hint to use
//   Share → Add to Home Screen.
// Nothing shows once the app is already running installed (standalone).

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const HINT_KEY = 'rm_portal_ios_install_hint_dismissed';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function readDismissed(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return {
    canInstall: !installed && deferred !== null,
    showIosHint: !installed && isIos(),
    install: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    },
  };
}

/** Compact button for the top bar / login card. */
export function InstallButton({ className = 'btn ghost small' }: { className?: string }) {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <button type="button" className={className} onClick={install}>
      ⬇ Install app
    </button>
  );
}

/** One-time iOS "Add to Home Screen" hint. */
export function IosInstallHint() {
  const { showIosHint } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!showIosHint || dismissed) return null;
  return (
    <div className="install-hint" role="note">
      <span>
        Install this app: tap <strong>Share</strong> <span aria-hidden>⎋</span> then <strong>Add to Home Screen</strong>.
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(HINT_KEY, '1');
          } catch {
            // ignore
          }
        }}
      >
        ×
      </button>
    </div>
  );
}

/** Thin banner while the device is offline — data needs a connection. */
export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  if (online) return null;
  return <div className="offline-banner">You're offline — changes can't be saved until you reconnect.</div>;
}
