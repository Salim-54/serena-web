// HTTP client for the RM Utility API (VITE_API_URL, e.g. https://api.example.com/api/v1).
//
// Tokens: the short-lived access token lives in memory only; the single-use
// refresh token is kept in localStorage so the installed app stays signed in.
// On a 401 the client refreshes once (shared by concurrent requests) and
// retries; if that fails the session ends. Errors arrive as
// { statusCode, error, message, code?, requestId } and are thrown as ApiError.

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:3100/api/v1';

const REFRESH_KEY = 'rm_portal_refresh';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

type Listener = (reason: 'expired' | 'password-change-required') => void;
const listeners = new Set<Listener>();
/** Notified when the session ends or a password change is required. */
export const onAuthProblem = (l: Listener) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

let accessToken: string | null = null;

export function setTokens(access: string | null, refresh?: string | null) {
  accessToken = access;
  if (refresh === undefined) return;
  try {
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Storage blocked: stays signed in for this tab only.
  }
}

export function storedRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let body: { message?: string | string[]; code?: string; requestId?: string } = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON (proxy error page etc.)
  }
  const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
  return new ApiError(message || `Request failed (${res.status}).`, res.status, body.code, body.requestId);
}

type Pair = { accessToken: string; refreshToken: string; user: unknown };
let inFlight: Promise<Pair | null> | null = null;

/**
 * Exchanges the stored refresh token for a new pair (null = session over).
 *
 * Refresh tokens are single-use and reuse signs everyone out, so refreshes
 * are serialised: one at a time per tab (shared promise) and across tabs
 * (Web Locks). Inside the lock the token is re-read from storage, so a tab
 * that waited uses the newer token another tab just stored.
 */
export function refreshSession(): Promise<Pair | null> {
  inFlight ??= withLock(doRefresh).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: { request: (name: string, cb: () => Promise<T>) => Promise<T> } }).locks;
  return locks ? locks.request('rm-portal-refresh', fn) : fn();
}

async function doRefresh(): Promise<Pair | null> {
  const token = storedRefreshToken();
  if (!token) return null;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: token }),
  }).catch(() => null);
  if (!res) throw new ApiError('Network error — check your connection.', 0, 'NETWORK');
  if (!res.ok) {
    // Only forget the token if nobody replaced it meanwhile.
    if (storedRefreshToken() === token) setTokens(null, null);
    return null;
  }
  const pair = (await res.json()) as Pair;
  setTokens(pair.accessToken, pair.refreshToken);
  return pair;
}

function refreshOnce(): Promise<boolean> {
  return refreshSession()
    .then((p) => Boolean(p))
    .catch(() => false);
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null | (string | number)[]>;
  body?: unknown;
  /** Return the raw Response (downloads). */
  raw?: boolean;
  /** Don't try to refresh on 401 (auth endpoints). */
  noRefresh?: boolean;
}

function url(path: string, query?: RequestOptions['query']) {
  const u = new URL(`${API_URL}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k, String(x)));
    else u.searchParams.set(k, String(v));
  }
  return u.toString();
}

export async function api<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const send = () =>
    fetch(url(path, opts.query), {
      method,
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

  let res = await send().catch(() => null);
  if (!res) throw new ApiError('Network error — check your connection.', 0, 'NETWORK');

  if (res.status === 401 && !opts.noRefresh) {
    if (await refreshOnce()) res = await send();
    if (res.status === 401) {
      listeners.forEach((l) => l('expired'));
      throw await parseError(res);
    }
  }
  if (!res.ok) {
    const err = await parseError(res);
    if (err.code === 'PASSWORD_CHANGE_REQUIRED') listeners.forEach((l) => l('password-change-required'));
    throw err;
  }
  if (opts.raw) return res as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const get = <T>(path: string, query?: RequestOptions['query']) => api<T>('GET', path, { query });
export const post = <T>(path: string, body?: unknown) => api<T>('POST', path, { body: body ?? {} });
export const put = <T>(path: string, body?: unknown) => api<T>('PUT', path, { body });
export const patch = <T>(path: string, body?: unknown) => api<T>('PATCH', path, { body });
export const del = <T>(path: string, body?: unknown) => api<T>('DELETE', path, { body });

/** Downloads a file from the API (sends the access token) and saves it. */
export async function download(path: string, query: RequestOptions['query'], fallbackName: string) {
  const res = await api<Response>('GET', path, { query, raw: true });
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/** Fetches every page of a paginated endpoint (bounded). */
export async function getAll<T>(path: string, query: RequestOptions['query'] = {}, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await get<Paginated<T>>(path, { ...query, page, limit: 200 });
    out.push(...res.data);
    if (out.length >= res.total || res.data.length === 0) break;
  }
  return out;
}
