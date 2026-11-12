import { NextResponse, type NextRequest } from 'next/server';
import { authConfig, readSession, SESSION_COOKIE } from './lib/auth';

// Every page and API requires a signed-in, allow-listed Google account when sign-in is configured.
// API routes check again on their own (lib/auth.ts denyUnlessAuthorized), so this is not the only gate.
export function proxy(request: NextRequest) {
  const config = authConfig();
  if (config.mode === 'local') return NextResponse.next();
  const { pathname } = request.nextUrl;
  const open = pathname === '/login' || pathname.startsWith('/api/auth/');
  const user = readSession(request.cookies.get(SESSION_COOKIE)?.value, config);
  if (open) return user && pathname === '/login' ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  if (user) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return config.mode === 'misconfigured'
      ? NextResponse.json({ error: '登入設定不完整，請聯絡管理者。' }, { status: 503 })
      : NextResponse.json({ error: '登入已失效，請重新登入。' }, { status: 401 });
  }
  return NextResponse.redirect(new URL(config.mode === 'misconfigured' ? '/login?error=config' : '/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)'],
};
