import { authConfig, readSession, SESSION_COOKIE } from '../../../../lib/auth';
import { resetAllowed, storageMode } from '../../../../lib/repository';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = authConfig();
  const user = readSession((await cookies()).get(SESSION_COOKIE)?.value, config);
  return Response.json({ mode: config.mode, user, storage: storageMode(), canReset: resetAllowed() }, { headers: { 'Cache-Control': 'no-store' } });
}
