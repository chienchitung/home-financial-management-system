import { denyUnlessAuthorized } from '../../../lib/auth';
import { saveAttachment } from '../../../lib/attachments';
export async function POST(request: Request) {
  const denied = denyUnlessAuthorized(request); if (denied) return denied;
  if (process.env.VERCEL) return new Response(null, { status: 404 });
  try {
    if (Number(request.headers.get('content-length')) > 9 * 1024 * 1024) throw new Error('照片過大，請縮小至 8 MB 以下。');
    const form = await request.formData(); const file = form.get('file');
    if (!(file instanceof File)) throw new Error('請選擇照片。');
    return Response.json({ id: await saveAttachment(file) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '上傳失敗' }, { status: 400 }); }
}
