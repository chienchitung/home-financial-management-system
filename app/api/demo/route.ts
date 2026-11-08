import { denyUnlessAuthorized } from '../../../lib/auth';
import { mutate, present, read } from '../../../lib/store';

export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  const denied = denyUnlessAuthorized(request); if (denied) return denied;
  if (process.env.VERCEL) return new Response(null, { status: 404 });
  return Response.json(present(read()));
}
export async function POST(request: Request) {
  const denied = denyUnlessAuthorized(request); if (denied) return denied;
  if (process.env.VERCEL) return new Response(null, { status: 404 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('操作格式有誤。');
    return Response.json(present(mutate(body as Record<string, unknown>)));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '操作失敗。' }, { status: 400 });
  }
}
