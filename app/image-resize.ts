// Shrinks bill photos in the browser before upload: hosted functions accept roughly 4.5 MB per request,
// and photos are stored in the database, so a readable ~2000 px JPEG is plenty for a bill.
export const MAX_EDGE = 2000;
export const KEEP_UNDER_BYTES = 1.5 * 1024 * 1024;
export const UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

export type Prepared = { file: File; resized: boolean };

export async function prepareImage(file: File): Promise<Prepared> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // e.g. HEIC outside Safari: the browser cannot decode it, so send the original if it fits.
    return { file, resized: false };
  }
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= KEEP_UNDER_BYTES) return { file, resized: false };
    const width = Math.round(bitmap.width * scale); const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return { file, resized: false };
    // White background so transparent screenshots stay legible as JPEG.
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return { file, resized: false };
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return { file: new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified }), resized: true };
  } finally { bitmap.close(); }
}

export const formatSize = (bytes: number) => bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
