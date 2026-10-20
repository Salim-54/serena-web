// Shrinks a photo in the browser before it's uploaded: longest side at most
// 1600 px, re-encoded as JPEG (~0.72 quality). A 3–5 MB phone photo usually
// ends up around 200–400 KB, which uploads quickly on hotel Wi-Fi / mobile
// data. Camera orientation (EXIF) is applied. If the browser can't decode
// the image (e.g. an unsupported format), the original file is returned.

const MAX_SIDE = 1600;
const QUALITY = 0.72;

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImage(file: File): Promise<Blob> {
  try {
    const { source, width, height, close } = await decode(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; // transparent PNGs → white, not black, in JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) return file;
    return blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
