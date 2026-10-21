import { useEffect, useState } from 'react';
import AuthImage from './AuthImage';

/**
 * Thumbnails that open a full-size viewer inside the app (a new browser tab
 * couldn't load protected photos — they need the access token).
 */
export default function PhotoStrip({ photos, size = 72 }: { photos: string[]; size?: number }) {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, photos.length]);

  if (!photos.length) return null;
  return (
    <>
      <div className="photo-grid">
        {photos.map((url, i) => (
          <button key={url} type="button" className="photo" style={{ width: size, height: size }} onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1}`}>
            <AuthImage src={url} size={size * 2} />
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="viewer" role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setOpen(null)}>
          <AuthImage src={photos[open]} />
          <div className="viewer-bar" onClick={(e) => e.stopPropagation()}>
            {photos.length > 1 && (
              <button type="button" className="btn ghost small" onClick={() => setOpen((open - 1 + photos.length) % photos.length)}>
                ‹ Prev
              </button>
            )}
            <span>
              {open + 1} / {photos.length}
            </span>
            {photos.length > 1 && (
              <button type="button" className="btn ghost small" onClick={() => setOpen((open + 1) % photos.length)}>
                Next ›
              </button>
            )}
            <button type="button" className="btn primary small" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
