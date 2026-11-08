import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { AUTH_BASE, AUTH_SECRET } from './auth-env';

// Mirrors lib/auth.ts seal() so the test can mint session cookies without contacting Google.
function session(email: string, secret = AUTH_SECRET, seconds = 3600) {
  const payload = Buffer.from(JSON.stringify({ email, name: '測試使用者', exp: Math.floor(Date.now() / 1000) + seconds })).toString('base64url');
  return payload + '.' + createHmac('sha256', secret).update('session.' + payload).digest('base64url');
}
const cookie = (value: string) => ({ name: 'hl_session', value, url: AUTH_BASE });

test('signed-out visitors are sent to the Google sign-in page and APIs refuse them', async ({ page, request }) => {
  await page.goto(AUTH_BASE + '/');
  await expect(page).toHaveURL(AUTH_BASE + '/login');
  await expect(page.getByRole('heading', { name: '登入帳本' })).toBeVisible();
  for (const path of ['/api/demo', '/api/attachments/00000000-0000-0000-0000-000000000000']) {
    expect((await request.get(AUTH_BASE + path)).status()).toBe(401);
  }
  expect((await request.post(AUTH_BASE + '/api/demo', { data: { action: 'reset' } })).status()).toBe(401);

  await expect(page.getByRole('link', { name: '使用 Google 帳號登入' })).toHaveAttribute('href', '/api/auth/login');
  const start = await request.get(AUTH_BASE + '/api/auth/login', { maxRedirects: 0 });
  expect(start.status()).toBe(307);
  const authorize = new URL(start.headers()['location']);
  expect(authorize.origin + authorize.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  expect(authorize.searchParams.get('client_id')).toBe('e2e-client.apps.googleusercontent.com');
  expect(authorize.searchParams.get('redirect_uri')).toBe(AUTH_BASE + '/api/auth/callback');
  expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authorize.searchParams.get('scope')).toBe('openid email profile');
  expect(authorize.searchParams.get('state')).toBeTruthy();
  expect(start.headers()['set-cookie']).toMatch(/hl_oauth=[^;]+;.*HttpOnly/i);

  await page.goto(AUTH_BASE + '/api/auth/callback?code=x&state=wrong');
  await expect(page.locator('.login-card').getByRole('alert')).toContainText('登入驗證已逾時');
  await page.goto(AUTH_BASE + '/api/auth/callback?error=access_denied');
  await expect(page.locator('.login-card').getByRole('alert')).toContainText('Google 登入沒有完成');
});

test('allow-listed session opens the ledger and can sign out', async ({ page, context }) => {
  await context.addCookies([cookie(session('owner@example.com'))]);
  await page.goto(AUTH_BASE + '/');
  await expect(page.getByRole('heading', { name: '收支總覽', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '每月收支' })).toBeVisible();
  await page.goto(AUTH_BASE + '/login');
  await expect(page).toHaveURL(AUTH_BASE + '/');
  await page.getByRole('button', { name: '登出' }).click();
  await expect(page).toHaveURL(/\/login\?signedOut=1$/);
  await expect(page.locator('.login-card').getByRole('status')).toContainText('已登出');
  expect((await page.request.get(AUTH_BASE + '/api/demo')).status()).toBe(401);
});

test('accounts not on the list, forged and expired cookies are rejected', async ({ page, context }) => {
  for (const value of [session('stranger@example.com'), session('owner@example.com', 'z'.repeat(40)), session('owner@example.com', AUTH_SECRET, -10)]) {
    await context.clearCookies(); await context.addCookies([cookie(value)]);
    await page.goto(AUTH_BASE + '/');
    await expect(page).toHaveURL(AUTH_BASE + '/login');
  }
});
