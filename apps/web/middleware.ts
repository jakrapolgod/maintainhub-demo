/**
 * Route protection middleware.
 *
 * The access token lives in sessionStorage (client-side only), so we cannot
 * read it here.  Instead we rely on the httpOnly refresh-token cookie that the
 * API sets at login time to decide whether the user has an active session.
 *
 * Flow:
 *   - Public routes  → always allowed through
 *   - Protected routes with no refresh cookie → redirect to /login
 *   - Protected routes with refresh cookie    → allowed through
 *     (the client will call /auth/refresh on the first 401 it receives)
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** Routes that don't require authentication. */
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  // Next.js internals
  '/_next',
  '/favicon.ico',
  '/api/', // Next.js API routes handle their own auth
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  // We set a lightweight `mh_session=1` cookie (not httpOnly, path=/) from
  // the login / register hooks so the middleware can detect an active session.
  // The actual credential is the access token in sessionStorage (client-only).
  const hasSession = request.cookies.has('mh_session')

  if (!hasSession) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match every path except:
     *   - _next/static  (static files)
     *   - _next/image   (image optimisation)
     *   - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
