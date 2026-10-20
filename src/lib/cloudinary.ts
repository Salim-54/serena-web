import { post } from './api';

// Photo uploads go straight to Cloudinary, but only with a signature from
// the API (POST /uploads/cloudinary-signature): the secret never reaches
// the browser and the server names the file after the ticket, e.g.
// "MT-00012-resolved-3f9a1c2b".

export const photosEnabled = true;

export type PhotoPurpose = 'request' | 'note' | 'assigned' | 'in_progress' | 'on_hold' | 'resolved' | 'closed' | 'cancelled' | 'open';

interface Signature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  publicId: string;
  signature: string;
  uploadUrl: string;
}

/** Uploads a (compressed) photo for [ticketId]; returns its secure URL. */
export async function uploadTicketPhoto(file: Blob, ticketId: number, purpose: PhotoPurpose): Promise<string> {
  const s = await post<Signature>('/uploads/cloudinary-signature', { ticketId, purpose });
  const body = new FormData();
  body.append('file', file, file instanceof File ? file.name : 'photo.jpg');
  body.append('api_key', s.apiKey);
  body.append('timestamp', String(s.timestamp));
  body.append('folder', s.folder);
  body.append('public_id', s.publicId);
  body.append('signature', s.signature);
  const res = await fetch(s.uploadUrl, { method: 'POST', body });
  if (!res.ok) throw new Error('Photo upload failed.');
  return ((await res.json()) as { secure_url: string }).secure_url;
}

/** Smaller, auto-format variant of a Cloudinary URL for thumbnails. */
export function thumbnail(url: string, size = 240): string {
  return url.replace('/upload/', `/upload/c_fill,w_${size},h_${size},f_auto,q_auto/`);
}
