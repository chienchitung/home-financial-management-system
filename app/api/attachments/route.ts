import { denyUnlessAuthorized } from '../../../lib/auth';
import { errorResponse, storeAttachment } from '../../../lib/repository';
import { LedgerError } from '../../../lib/store';

export async function POST(request: Request) {
  const denied = denyUnlessAuthorized(request); if (denied) return denied;
  try {
    if (Number(request.headers.get('content-length')) > 9 * 1024 * 1024) throw new LedgerError('照片過大，請縮小至 8 MB 以下。');
    const form = await request.formData().catch(() => { throw new LedgerError('請選擇照片。'); });
    const file = form.get('file');
    if (!(file instanceof File)) throw new LedgerError('請選擇照片。');
    return Response.json({ id: await storeAttachment(file) });
  } catch (error) { return errorResponse(error, 'Attachment upload failed', '照片上傳失敗，請稍後再試。'); }
}
