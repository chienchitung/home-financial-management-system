import { NextResponse } from 'next/server';
import { authConfig, cookieOptions, OAUTH_COOKIE, OAUTH_SECONDS, pkceChallenge, randomToken, seal, requestOrigin } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const config = authConfig();
  const origin = requestOrigin(request);
  if (config.mode === 'local') return NextResponse.redirect(new URL('/', origin));
  if (config.mode === 'misconfigured') return NextResponse.redirect(new URL('/login?error=config', origin));
  // The OAuth cookie must live on the same host Google redirects back to.
  const base = config.baseUrl ?? origin;
  if (base !== origin) return NextResponse.redirect(base + '/api/auth/login');
  const state = randomToken(); const nonce = randomToken(); const verifier = randomToken(48);
  const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  google.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: base + '/api/auth/callback', response_type: 'code',
    scope: 'openid email profile', state, nonce, code_challenge: pkceChallenge(verifier), code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  const response = NextResponse.redirect(google);
  response.cookies.set(OAUTH_COOKIE, seal({ state, nonce, verifier }, config.secret, 'oauth', OAUTH_SECONDS),
    cookieOptions(base.startsWith('https:'), OAUTH_SECONDS));
  return response;
}
