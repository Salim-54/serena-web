import { photosEnabled } from '../lib/cloudinary';

/** "📷 Take photo" (camera) and "🖼 Attach from gallery" buttons. */
export default function PhotoPicker({
  onFiles,
  disabled = false,
  compact = false,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  if (!photosEnabled) return null;
  const handle = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (files.length) onFiles(files);
  };
  return (
    <div className="photo-buttons">
      <label className={`btn ghost small ${disabled ? 'disabled' : ''}`}>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={disabled}
          onChange={(e) => {
            handle(e.target.files);
            e.target.value = '';
          }}
        />
        📷 {compact ? 'Photo' : 'Take photo'}
      </label>
      <label className={`btn ghost small ${disabled ? 'disabled' : ''}`}>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={disabled}
          onChange={(e) => {
            handle(e.target.files);
            e.target.value = '';
          }}
        />
        🖼 {compact ? 'Attach' : 'Attach from gallery'}
      </label>
    </div>
  );
}
