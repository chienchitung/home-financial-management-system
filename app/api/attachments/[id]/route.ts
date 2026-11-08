import { attachment } from '../../../../lib/attachments';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.VERCEL) return new Response(null, { status: 404 });
  try {
    const { id } = await context.params; const file = attachment(id);
    return new Response(file.bytes, { headers: { 'Content-Type': file.type,
      'Content-Disposition': `${file.type === 'image/heic' || file.type === 'image/heif' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response('找不到原檔', { status: 404 }); }
}
