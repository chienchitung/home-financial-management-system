export const AUTH_PORT = 3102;
export const AUTH_BASE = `http://127.0.0.1:${AUTH_PORT}`;
export const AUTH_SECRET = 'e2e-only-secret-not-used-anywhere-else-000';
export const AUTH_ENV = {
  GOOGLE_CLIENT_ID: 'e2e-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'e2e-client-secret',
  AUTH_SECRET, ALLOWED_EMAILS: 'owner@example.com', AUTH_URL: AUTH_BASE,
};
