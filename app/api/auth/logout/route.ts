import { NextResponse } from 'next/server';
import { requestOrigin, SESSION_COOKIE } from '../../../../lib/auth';

export function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/login?signedOut=1', requestOrigin(request)), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
