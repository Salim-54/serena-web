import { useEffect, useState } from 'react';
import { loadPhoto, thumbnail } from '../lib/photos';

/**
 * <img> for ticket photos. Photos stored by the API are fetched with the
 * access token (they're protected like any other API data); older Cloudinary
 * photos load directly.
 */
export default function AuthImage({ src, size, alt = '' }: { src: string; size?: number; alt?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    loadPhoto(size ? thumbnail(src, size) : src)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [src, size]);

  if (failed) return <span className="photo-missing" title="Photo unavailable">⚠</span>;
  if (!url) return <span className="photo-loading" aria-label="Loading photo" />;
  return <img src={url} alt={alt} />;
}
