import { denyUnlessAuthorized } from '../../../../lib/auth';
import { loadAttachment, StorageUnavailable } from '../../../../lib/repository';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = denyUnlessAuthorized(request); if (denied) return denied;
  try {
    const { id } = await context.params; const file = await loadAttachment(id);
    return new Response(new Uint8Array(file.bytes), { headers: { 'Content-Type': file.type,
      'Content-Disposition': `${file.type === 'image/heic' || file.type === 'image/heif' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    if (error instanceof StorageUnavailable) return new Response(error.message, { status: 503 });
    if (!(error instanceof Error && (error.message === '找不到原檔' || (error as NodeJS.ErrnoException).code === 'ENOENT'))) console.error('Attachment read failed', error);
    return new Response('找不到原檔', { status: 404 });
  }
}
