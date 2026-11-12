import { NextResponse } from 'next/server';
import { authConfig, cookieOptions, createSession, decodeJwtPayload, OAUTH_COOKIE, readCookie, safeEqual, SESSION_COOKIE, SESSION_SECONDS, unseal, validateIdToken, requestOrigin } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const config = authConfig();
  const url = new URL(request.url);
  if (config.mode === 'local') return NextResponse.redirect(new URL('/', requestOrigin(request)));
  const fail = (error: string) => {
    const response = NextResponse.redirect(new URL('/login?error=' + error, requestOrigin(request)));
    response.cookies.delete(OAUTH_COOKIE);
    return response;
  };
  if (config.mode === 'misconfigured') return fail('config');
  if (url.searchParams.get('error')) return fail('google');
  const base = config.baseUrl ?? requestOrigin(request);
  const stored = unseal<{ state: string; nonce: string; verifier: string }>(
readCookie(request, OAUTH_COOKIE), config.secret, 'oauth');
  const code = url.searchParams.get('code');
  if (!stored || !code || !safeEqual(url.searchParams.get('state') ?? undefined, stored.state)) return fail('state');
  let idToken: string | undefined;
  try {
    const exchange = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret,
        redirect_uri: base + '/api/auth/callback', grant_type: 'authorization_code', code_verifier: stored.verifier }),
      cache: 'no-store',
    });
    if (exchange.ok) idToken = (await exchange.json()).id_token;
  } catch { /* handled below */ }
  const claims = idToken && decodeJwtPayload(idToken);
  const user = claims && validateIdToken(claims, { clientId: config.clientId, nonce: stored.nonce });
  if (!user) return fail('google');
  if (!config.allowed.has(user.email)) return fail('not_allowed');
  const response = NextResponse.redirect(new URL('/', base));
  response.cookies.delete(OAUTH_COOKIE);
  response.cookies.set(SESSION_COOKIE, createSession(user, config.secret), cookieOptions(base.startsWith('https:'), SESSION_SECONDS));
  return response;
}
