import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Google sign-in for the household ledger.
 *
 * Mode is derived from the environment:
 * - "google": all required variables are set; every page and API needs a valid session.
 * - "local": nothing is configured and we are not on Vercel; the local demo runs without login.
 * - "misconfigured": partially configured, or on Vercel without configuration; everything is locked.
 */
export const SESSION_COOKIE = 'hl_session';
export const OAUTH_COOKIE = 'hl_oauth';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const OAUTH_SECONDS = 10 * 60;
export const REQUIRED_ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AUTH_SECRET', 'ALLOWED_EMAILS'] as const;

type Env = Record<string, string | undefined>;
export type AuthConfig =
  | { mode: 'local' }
  | { mode: 'misconfigured'; missing: string[] }
  | { mode: 'google'; clientId: string; clientSecret: string; secret: string; allowed: Set<string>; baseUrl?: string };
export type SessionUser = { email: string; name: string };

export function parseAllowed(value: string | undefined) {
  return new Set((value ?? '').split(/[,\s]+/).map(item => item.trim().toLowerCase()).filter(Boolean));
}

export function authConfig(env: Env = process.env): AuthConfig {
  const missing = REQUIRED_ENV.filter(name => !env[name]?.trim());
  if (missing.length === REQUIRED_ENV.length && !env.VERCEL) return { mode: 'local' };
  if (missing.length) return { mode: 'misconfigured', missing };
  if (env.AUTH_SECRET!.length < 32) return { mode: 'misconfigured', missing: ['AUTH_SECRET（至少 32 個字元）'] };
  const allowed = parseAllowed(env.ALLOWED_EMAILS);
  if (!allowed.size) return { mode: 'misconfigured', missing: ['ALLOWED_EMAILS'] };
  return { mode: 'google', clientId: env.GOOGLE_CLIENT_ID!.trim(), clientSecret: env.GOOGLE_CLIENT_SECRET!.trim(),
    secret: env.AUTH_SECRET!, allowed, baseUrl: env.AUTH_URL?.trim().replace(/\/+$/, '') || undefined };
}

const encode = (value: Buffer | string) => Buffer.from(value).toString('base64url');
const mac = (payload: string, secret: string, purpose: string) => createHmac('sha256', secret).update(purpose + '.' + payload).digest();

/** Signs a JSON payload; `purpose` keeps session and OAuth-state tokens from being swapped. */
export function seal(data: object, secret: string, purpose: string, seconds: number, now = Date.now()) {
  const payload = encode(JSON.stringify({ ...data, exp: Math.floor(now / 1000) + seconds }));
  return payload + '.' + encode(mac(payload, secret, purpose));
}

export function unseal<T>(token: string | undefined, secret: string, purpose: string, now = Date.now()): T | null {
  if (!token) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = mac(payload, secret, purpose);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data?.exp !== 'number' || data.exp * 1000 <= now) return null;
    return data as T;
  } catch { return null; }
}

export function createSession(user: SessionUser, secret: string, now = Date.now()) {
  return seal({ email: user.email.toLowerCase(), name: user.name }, secret, 'session', SESSION_SECONDS, now);
}

/** Returns the user only if the cookie is valid and the email is still on the allow list. */
export function readSession(token: string | undefined, config: AuthConfig, now = Date.now()): SessionUser | null {
  if (config.mode !== 'google') return null;
  const data = unseal<SessionUser>(token, config.secret, 'session', now);
  if (!data || typeof data.email !== 'string' || !config.allowed.has(data.email.toLowerCase())) return null;
  return { email: data.email, name: typeof data.name === 'string' ? data.name : data.email };
}

export function randomToken(bytes = 32) { return randomBytes(bytes).toString('base64url'); }
export function pkceChallenge(verifier: string) { return createHash('sha256').update(verifier).digest('base64url'); }

export function safeEqual(a: string | undefined, b: string | undefined) {
  if (!a || !b) return false;
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Validates claims of an ID token received directly from Google's token endpoint over TLS
 * (per Google's OpenID Connect guide, the signature check may be skipped in that case).
 */
export function validateIdToken(payload: Record<string, unknown>, expected: { clientId: string; nonce: string }, now = Date.now()) {
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') return null;
  if (payload.aud !== expected.clientId) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null;
  if (!safeEqual(payload.nonce as string | undefined, expected.nonce)) return null;
  if (payload.email_verified !== true || typeof payload.email !== 'string') return null;
  return { email: payload.email.toLowerCase(), name: typeof payload.name === 'string' && payload.name ? payload.name : payload.email };
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); } catch { return null; }
}

/** The origin the browser actually used (Next may report its bind address in request.url). */
export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim() || request.headers.get('host') || url.host;
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

export function cookieOptions(secure: boolean, maxAge: number) {
  return { httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge };
}

export function readCookie(request: Request, name: string) {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}

/** Data-layer guard for API routes, in addition to the proxy. Returns a response when access is denied. */
export function denyUnlessAuthorized(request: Request): Response | null {
  const config = authConfig();
  if (config.mode === 'local') return null;
  if (config.mode === 'misconfigured') return Response.json({ error: '登入設定不完整，請聯絡管理者。' }, { status: 503 });
  return readSession(readCookie(request, SESSION_COOKIE), config) ? null
    : Response.json({ error: '登入已失效，請重新登入。' }, { status: 401 });
}
