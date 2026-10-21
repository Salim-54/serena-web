import { API_URL, api } from './api';

// Ticket photos are stored by the RM Utility API on its own machine.
// - Upload: POST /uploads/photos (the server checks the file and names it
//   after the ticket, e.g. "MT-00012-resolved-…jpg").
// - View: tickets return plain links (/api/v1/files/<name>). They're
//   protected like the rest of the API: fetched with the access token, and
//   only for tickets the user may see — so photos are loaded as blobs here
//   and shown via object URLs (no token ever goes in a URL).

export const photosEnabled = true;

export type PhotoPurpose = 'request' | 'note' | 'assigned' | 'in_progress' | 'on_hold' | 'resolved' | 'closed' | 'cancelled' | 'open';

const API_PREFIX = new URL(API_URL).pathname.replace(/\/$/, ''); // e.g. /api/v1

/** Uploads a (compressed) photo for [ticketId]; returns a link usable in `photos`. */
export async function uploadTicketPhoto(file: Blob, ticketId: number, purpose: PhotoPurpose): Promise<string> {
  const form = new FormData();
  form.append('ticketId', String(ticketId));
  form.append('purpose', purpose);
  form.append('file', file, file instanceof File ? file.name : 'photo.jpg');
  const res = await api<{ key: string; url: string }>('POST', '/uploads/photos', { form });
  return res.url;
}

/** A link to a photo stored by the API (needs the access token). */
export const isApiPhoto = (url: string) => url.startsWith(`${API_PREFIX}/files/`);

// In-memory cache: link → object URL (cleared on sign-out).
const cache = new Map<string, Promise<string>>();

/** Fetches a protected photo with the access token; returns an object URL. */
export function loadPhoto(url: string): Promise<string> {
  if (!isApiPhoto(url)) return Promise.resolve(url); // older Cloudinary photos
  let p = cache.get(url);
  if (!p) {
    p = api<Response>('GET', url.slice(API_PREFIX.length), { raw: true })
      .then((res) => res.blob())
      .then((blob) => URL.createObjectURL(blob));
    p.catch(() => cache.delete(url)); // retry next time
    cache.set(url, p);
  }
  return p;
}

/** Forget loaded photos (on sign-out). */
export async function clearPhotoCache() {
  const all = [...cache.values()];
  cache.clear();
  for (const p of all) p.then((u) => URL.revokeObjectURL(u)).catch(() => {});
}

/** Thumbnail for older Cloudinary photos; API photos are already compressed. */
export function thumbnail(url: string, size = 240): string {
  if (url.includes('res.cloudinary.com/')) return url.replace('/upload/', `/upload/c_fill,w_${size},h_${size},f_auto,q_auto/`);
  return url;
}
