// Replaces Supabase Realtime: re-runs [fn] every [ms] while the page is
// visible, and immediately when it becomes visible again.
export function poll(fn: () => void, ms = 30_000): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const start = () => {
    stop();
    timer = setInterval(() => document.visibilityState === 'visible' && fn(), ms);
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') fn();
  };
  start();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
