import { useEffect, useState } from 'react';

// Tiny hash router — #/, #/new, #/tickets/42. Hash URLs need no server
// rewrite rules, so the build can be dropped on any static host.

export function useRoute(): string {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string) {
  window.location.hash = path;
}
