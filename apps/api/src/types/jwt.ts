import type { Role } from '@prisma/client'

/** Claims embedded in every access token. */
export interface JwtPayload {
  /** User ID (Prisma cuid) for access tokens; invitee email for invitation tokens */
  sub: string
  /** Tenant ID */
  tid: string
  /** User role — for access tokens: current role; for invitation tokens: role being granted */
  role: Role
  /** User email */
  email: string
  /** Tenant slug — useful for routing decisions */
  slug: string
  /**
   * Invitation ID — present ONLY on invitation tokens.
   * Used to look up the invitation record in the DB on /accept.
   */
  iid?: string
  /**
   * Token type discriminator.
   * 'invitation' → produced by POST /invitations, consumed by POST /invitations/:token/accept
   * Absent on standard access tokens.
   */
  typ?: string
}

// Augment @fastify/jwt so request.user is typed throughout the app.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}
