import { API_URL, api } from './api';

// Ticket photos are stored by the RM Utility API on its own machine.
// Uploads go to POST /uploads/photos (the server checks the file and names
// it after the ticket, e.g. "MT-00012-resolved-…jpg"); tickets come back
// with signed, expiring links to show them.

export const photosEnabled = true;

export type PhotoPurpose = 'request' | 'note' | 'assigned' | 'in_progress' | 'on_hold' | 'resolved' | 'closed' | 'cancelled' | 'open';

const API_ORIGIN = new URL(API_URL).origin;

/** Uploads a (compressed) photo for [ticketId]; returns a link usable in `photos`. */
export async function uploadTicketPhoto(file: Blob, ticketId: number, purpose: PhotoPurpose): Promise<string> {
  const form = new FormData();
  form.append('ticketId', String(ticketId));
  form.append('purpose', purpose);
  form.append('file', file, file instanceof File ? file.name : 'photo.jpg');
  const res = await api<{ key: string; url: string }>('POST', '/uploads/photos', { form });
  return res.url;
}

/** Absolute address for a photo link (the API returns links relative to its origin). */
export function photoSrc(url: string): string {
  return url.startsWith('/') ? API_ORIGIN + url : url;
}

/** Thumbnail source: Cloudinary transform for older photos, otherwise the photo itself. */
export function thumbnail(url: string, size = 240): string {
  if (url.includes('res.cloudinary.com/')) return url.replace('/upload/', `/upload/c_fill,w_${size},h_${size},f_auto,q_auto/`);
  return photoSrc(url);
}
