import { ApiError, api, refreshSession, setTokens, storedRefreshToken } from './api';
import { clearPhotoCache } from './photos';

// Sign-in against the RM Utility API. The server decides what each login
// may do and returns it as `permissions` (see lib/permissions.ts).

export interface ApiUser {
  id: number;
  email: string;
  name: string | null;
  role: 'admin' | 'supervisor' | 'staff' | 'department';
  departmentId: number | null;
  departmentName: string | null;
  departmentKind: 'standard' | 'administration' | 'maintenance' | null;
  permissions: string[];
  raiseAs: 'choose' | 'own-department' | 'maintenance';
  canUseMobileApp: boolean;
  mustChangePassword: boolean;
}

interface SessionBase {
  userId: string;
  email: string;
  name: string;
  permissions: string[];
  raiseAs: ApiUser['raiseAs'];
  departmentKind: ApiUser['departmentKind'];
  mustChangePassword: boolean;
}

export interface DepartmentSession extends SessionBase {
  kind: 'department';
  departmentId: string;
  departmentName: string;
}

export interface AdminSession extends SessionBase {
  kind: 'admin';
}

export interface StaffSession extends SessionBase {
  kind: 'staff' | 'supervisor';
}

export type Session = DepartmentSession | AdminSession | StaffSession;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
}

export function toSession(u: ApiUser): Session {
  const base: SessionBase = {
    userId: String(u.id),
    email: u.email,
    name: u.name?.trim() || u.email,
    permissions: u.permissions,
    raiseAs: u.raiseAs,
    departmentKind: u.departmentKind,
    mustChangePassword: u.mustChangePassword,
  };
  if (u.role === 'department') {
    return { ...base, kind: 'department', departmentId: String(u.departmentId), departmentName: u.departmentName ?? 'Department' };
  }
  return { ...base, kind: u.role };
}

export async function login(email: string, password: string): Promise<Session> {
  try {
    const pair = await api<TokenPair>('POST', '/auth/login', { body: { email: email.trim(), password, client: 'portal' }, noRefresh: true });
    setTokens(pair.accessToken, pair.refreshToken);
    return toSession(pair.user);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'INVALID_CREDENTIALS') throw new Error('Invalid email or password.');
    throw e;
  }
}

/** Restores the session from the stored refresh token (null if signed out). */
export async function restoreSession(): Promise<Session | null> {
  if (!storedRefreshToken()) return null;
  const pair = await refreshSession();
  return pair ? toSession(pair.user as ApiUser) : null;
}

export async function logout() {
  clearPhotoCache();
  const refreshToken = storedRefreshToken();
  setTokens(null, null);
  if (refreshToken) await api('POST', '/auth/logout', { body: { refreshToken }, noRefresh: true }).catch(() => {});
}

/** Changes the password; the server returns a fresh token pair for this session. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<Session> {
  const pair = await api<TokenPair>('PATCH', '/auth/password', { body: { currentPassword, newPassword } });
  setTokens(pair.accessToken, pair.refreshToken);
  return toSession(pair.user);
}

// The requester's name is remembered per browser so regular users at a
// shared front-desk PC don't retype it, but it's always editable.
const NAME_KEY = 'rm_portal_requester_name';

export function lastRequesterName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberRequesterName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    // ignore
  }
}
