import { currentUser, denyUnlessAuthorized } from '../../../lib/auth';
import { errorResponse, loadLedger, runAction } from '../../../lib/repository';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = denyUnlessAuthorized(request); if (denied) return denied;
  try { return Response.json(await loadLedger(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return errorResponse(error, 'Ledger read failed', '讀取帳本失敗，請稍後再試。'); }
}

export async function POST(request: Request) {
  const denied = denyUnlessAuthorized(request); if (denied) return denied;
  let body: unknown;
  try { body = await request.json(); } catch { body = undefined; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: '操作格式有誤。' }, { status: 400 });
  try { return Response.json(await runAction(body as Record<string, unknown>, currentUser(request)?.email)); }
  catch (error) { return errorResponse(error, 'Ledger write failed'); }
}
