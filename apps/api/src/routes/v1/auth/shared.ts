import type { CookieSerializeOptions } from '@fastify/cookie'
import { config } from '../../../config'

export const REFRESH_COOKIE_NAME = 'refresh_token'

/**
 * httpOnly cookie options for the refresh token.
 * - httpOnly: not accessible from JS (XSS protection)
 * - secure: HTTPS-only in production
 * - sameSite: 'lax' — sent on same-origin requests + top-level navigation
 * - path: scoped to auth routes only (not sent with API data requests)
 */
export const cookieOptions: CookieSerializeOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
}
