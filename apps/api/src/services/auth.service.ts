import { createHash, randomBytes } from 'node:crypto'
import { type Plan, type PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import type Redis from 'ioredis'
import { DomainException } from '../errors/domain.exception'
import type { ForgotPasswordBody, LoginBody, RegisterBody, ResetPasswordBody } from '../schemas/auth'

// ── Constants ─────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12
const REFRESH_TTL_SEC = 7 * 24 * 60 * 60 // 7 days
const REDIS_PREFIX = 'rt:'
const RESET_PREFIX = 'pw_reset:'
const RESET_TTL_SEC = 60 * 60 // 1 hour
export const RESET_EXPIRES_MINUTES = 60

// A known-cost hash used when the user is not found, so the bcrypt comparison
// always runs and the response time stays constant (timing-attack prevention).
const DUMMY_HASH = '$2b$12$invalidhashfortimingequalityXXXXXXXXXXXXXXXXXXX'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  email: string
  name: string
  role: Role
  tenantId: string
}

export interface TenantProfile {
  id: string
  name: string
  slug: string
  plan: Plan
}

export interface AuthResult {
  user: UserProfile
  tenant: TenantProfile
  /** Raw refresh token — caller is responsible for storing in httpOnly cookie */
  refreshToken: string
}

interface CachedTokenData {
  userId: string
  tenantId: string
  role: Role
  email: string
  slug: string
}

// ── Service ───────────────────────────────────────────────────────────────────

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  async register(dto: RegisterBody): Promise<AuthResult> {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } })
    if (existing) {
      throw new DomainException(
        `The identifier "${dto.slug}" is already in use`,
        'TENANT_SLUG_TAKEN',
        409,
      )
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)

    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const newTenant = await tx.tenant.create({
        data: { name: dto.companyName, slug: dto.slug },
      })
      const newUser = await tx.user.create({
        data: {
          tenantId: newTenant.id,
          email: dto.adminEmail,
          name: dto.adminName,
          passwordHash,
          role: Role.ADMIN,
        },
      })
      await tx.auditLog.create({
        data: {
          tenantId: newTenant.id,
          userId: newUser.id,
          action: 'REGISTER',
          entityType: 'Tenant',
          entityId: newTenant.id,
          after: { name: newTenant.name, slug: newTenant.slug },
        },
      })
      return { tenant: newTenant, user: newUser }
    })

    const refreshToken = await this.mintRefreshToken({
      userId: user.id,
      tenantId: tenant.id,
      role: user.role,
      email: user.email,
      slug: tenant.slug,
    })

    return {
      user: AuthService.toUserProfile(user),
      tenant: AuthService.toTenantProfile(tenant),
      refreshToken,
    }
  }

  async login(dto: LoginBody): Promise<AuthResult> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } })

    // Find user only when tenant exists — but always run bcrypt to prevent timing leaks
    const user = tenant
      ? await this.prisma.user.findUnique({
          where: { tenantId_email: { tenantId: tenant.id, email: dto.email } },
        })
      : null

    const hashToCompare = user?.passwordHash ?? DUMMY_HASH
    const passwordOk = await bcrypt.compare(dto.password, hashToCompare)

    if (!tenant || !tenant.isActive || !user || !user.isActive || !passwordOk) {
      // Single message — don't reveal whether tenant/user/password was wrong
      throw new DomainException('Invalid credentials', 'INVALID_CREDENTIALS', 401)
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          action: 'USER_LOGIN',
          entityType: 'User',
          entityId: user.id,
        },
      }),
    ])

    const refreshToken = await this.mintRefreshToken({
      userId: user.id,
      tenantId: tenant.id,
      role: user.role,
      email: user.email,
      slug: tenant.slug,
    })

    return {
      user: AuthService.toUserProfile(user),
      tenant: AuthService.toTenantProfile(tenant),
      refreshToken,
    }
  }

  async refresh(token: string): Promise<AuthResult> {
    const tokenHash = AuthService.hash(token)

    // Fast path: Redis hit means the token is valid and not yet expired
    const raw = await this.redis.get(`${REDIS_PREFIX}${tokenHash}`)

    if (!raw) {
      // Slow path: check DB to distinguish "expired" from "reuse attack"
      const dbToken = await this.prisma.refreshToken.findUnique({ where: { tokenHash } })
      if (dbToken?.revokedAt) {
        // A previously revoked token was presented — possible token theft.
        // Revoke every active session for this user as a defensive measure.
        await this.revokeAllForUser(dbToken.userId)
        throw new DomainException(
          'Security event: all sessions have been invalidated',
          'TOKEN_REUSE_DETECTED',
          401,
        )
      }
      throw new DomainException('Invalid or expired session', 'INVALID_TOKEN', 401)
    }

    const cached = JSON.parse(raw) as CachedTokenData

    // Load fresh data to pick up role / active-status changes made since last login
    const [user, tenant] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: cached.userId, isActive: true, deletedAt: null },
      }),
      this.prisma.tenant.findFirst({
        where: { id: cached.tenantId, isActive: true },
      }),
    ])

    if (!user || !tenant) {
      throw new DomainException('Account not found or disabled', 'ACCOUNT_INACTIVE', 401)
    }

    // Revoke old token before issuing new one (rotation)
    await this.revokeToken(tokenHash)

    const newRefreshToken = await this.mintRefreshToken({
      userId: user.id,
      tenantId: tenant.id,
      role: user.role,
      email: user.email,
      slug: tenant.slug,
    })

    return {
      user: AuthService.toUserProfile(user),
      tenant: AuthService.toTenantProfile(tenant),
      refreshToken: newRefreshToken,
    }
  }

  /**
   * Initiates password reset flow.
   * Generates a secure token, stores its hash in Redis (TTL 1h),
   * and returns the raw token so the caller can email the reset URL.
   *
   * Always returns void — do not reveal whether the email exists in the tenant
   * (prevents user enumeration). Errors are only thrown on infrastructure failures.
   */
  async forgotPassword(dto: ForgotPasswordBody): Promise<{ rawToken: string; tenantName: string } | null> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } })
    if (!tenant || !tenant.isActive) return null

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: dto.email } },
      select: { id: true, isActive: true, deletedAt: true },
    })
    if (!user || !user.isActive || user.deletedAt) return null

    // Raw token: 32 random bytes → URL-safe base64 (no padding)
    const rawToken = randomBytes(32).toString('base64url')
    const tokenHash = AuthService.hash(rawToken)

    // One outstanding reset token per user — overwrite any existing one
    await this.redis.setex(
      `${RESET_PREFIX}${tokenHash}`,
      RESET_TTL_SEC,
      JSON.stringify({ userId: user.id, tenantId: tenant.id }),
    )

    await this.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'User',
        entityId: user.id,
      },
    })

    return { rawToken, tenantName: tenant.name }
  }

  /**
   * Validates the reset token and updates the user's password.
   * The token is single-use — it is deleted from Redis immediately.
   */
  async resetPassword(dto: ResetPasswordBody): Promise<void> {
    const tokenHash = AuthService.hash(dto.token)
    const raw = await this.redis.get(`${RESET_PREFIX}${tokenHash}`)

    if (!raw) {
      throw new DomainException('Invalid or expired reset link', 'INVALID_RESET_TOKEN', 401)
    }

    const { userId, tenantId } = JSON.parse(raw) as { userId: string; tenantId: string }

    // Delete token immediately (single-use)
    await this.redis.del(`${RESET_PREFIX}${tokenHash}`)

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      // Invalidate all existing refresh tokens — force re-login
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'PASSWORD_RESET_COMPLETED',
          entityType: 'User',
          entityId: userId,
        },
      }),
    ])
  }

  async logout(token: string): Promise<void> {
    const tokenHash = AuthService.hash(token)

    // Fetch metadata for audit log before deleting
    const raw = await this.redis.get(`${REDIS_PREFIX}${tokenHash}`)
    const cached = raw ? (JSON.parse(raw) as CachedTokenData) : null

    await this.revokeToken(tokenHash)

    if (cached) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: cached.tenantId,
          userId: cached.userId,
          action: 'USER_LOGOUT',
          entityType: 'User',
          entityId: cached.userId,
        },
      })
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  private async mintRefreshToken(data: CachedTokenData): Promise<string> {
    // 48 random bytes → 64-char base64url string (no padding chars)
    const token = randomBytes(48).toString('base64url')
    const tokenHash = AuthService.hash(token)
    const expiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1_000)

    await Promise.all([
      // Persist in DB for audit trail and reuse-attack detection
      this.prisma.refreshToken.create({
        data: { userId: data.userId, tokenHash, expiresAt },
      }),
      // Cache in Redis for fast validation on each /refresh request
      this.redis.setex(
        `${REDIS_PREFIX}${tokenHash}`,
        REFRESH_TTL_SEC,
        JSON.stringify(data),
      ),
    ])

    return token
  }

  private async revokeToken(tokenHash: string): Promise<void> {
    await Promise.allSettled([
      this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.redis.del(`${REDIS_PREFIX}${tokenHash}`),
    ])
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    const active = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null },
      select: { tokenHash: true },
    })
    await Promise.allSettled([
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      ...active.map(({ tokenHash }) => this.redis.del(`${REDIS_PREFIX}${tokenHash}`)),
    ])
  }

  private static toUserProfile(user: {
    id: string
    email: string
    name: string
    role: Role
    tenantId: string
  }): UserProfile {
    return { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId }
  }

  private static toTenantProfile(tenant: {
    id: string
    name: string
    slug: string
    plan: Plan
  }): TenantProfile {
    return { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan }
  }
}
