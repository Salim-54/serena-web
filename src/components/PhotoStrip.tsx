import { photoSrc, thumbnail } from '../lib/photos';

/** Small thumbnails that open the full photo. */
export default function PhotoStrip({ photos, size = 72 }: { photos: string[]; size?: number }) {
  if (!photos.length) return null;
  return (
    <div className="photo-grid">
      {photos.map((url) => (
        <a key={url} href={photoSrc(url)} target="_blank" rel="noreferrer" className="photo" style={{ width: size, height: size }}>
          <img src={thumbnail(url, size * 2)} alt="" />
        </a>
      ))}
    </div>
  );
}
