import { createHash } from 'node:crypto'
import type { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { DomainException } from '../errors/domain.exception'
import type { TenantClient } from '../lib/tenant-prisma'
import type { AcceptInvitationDto, SendInvitationDto } from '../schemas/invitation'

// ── Constants ─────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12
const INVITE_TTL_MS = 48 * 60 * 60 * 1000 // 48 hours

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PreparedInvitation {
  /** Pre-generated ID — used as the `iid` claim in the JWT before DB insert. */
  id: string
  tenantId: string
  email: string
  role: Role
  expiresAt: Date
}

// ── Service ───────────────────────────────────────────────────────────────────

export class InvitationService {
  constructor(
    /** Tenant-scoped client — used for tenant-isolated operations (send flow). */
    private readonly db: TenantClient,
    /** Base client — used for public lookups that bypass tenant filtering (accept flow). */
    private readonly basePrisma: PrismaClient,
    private readonly tenantId: string,
  ) {}

  // ── Send flow ──────────────────────────────────────────────────────────────

  /**
   * Validates the invitation candidate and persists the invitation record.
   * The caller (route handler) is responsible for signing the JWT and sending
   * the email after this method returns successfully.
   *
   * Returns the prepared invitation data including the pre-generated ID that
   * must be embedded in the JWT as the `iid` claim.
   */
  async prepare(
    dto: SendInvitationDto,
    inviterId: string,
    invitationId: string,
    tokenHash: string,
  ): Promise<PreparedInvitation> {
    // Guard: cannot invite someone who is already an active member
    const existing = await this.db.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      select: { id: true },
    })
    if (existing) {
      throw new DomainException(
        `${dto.email} is already a member of this workspace`,
        'EMAIL_ALREADY_MEMBER',
        409,
      )
    }

    // Revoke any pending invitations for this email in this tenant before
    // creating a new one — prevents accumulation of stale invitation links.
    await this.db.invitation.updateMany({
      where: { email: dto.email, acceptedAt: null },
      data: { expiresAt: new Date(0) }, // force-expire immediately
    })

    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)

    await this.db.invitation.create({
      data: {
        id: invitationId, // pre-generated so JWT can embed it before DB write
        tenantId: this.tenantId,
        email: dto.email,
        role: dto.role as Role,
        tokenHash,
        expiresAt,
        invitedById: inviterId,
      },
    })

    return {
      id: invitationId,
      tenantId: this.tenantId,
      email: dto.email,
      role: dto.role as Role,
      expiresAt,
    }
  }

  // ── Accept flow ────────────────────────────────────────────────────────────

  /**
   * Validates the invitation and creates the user account.
   * Uses the base Prisma client (not tenant-scoped) because this is a public
   * endpoint — the JWT provides the auth proof.
   */
  async accept(
    invitationId: string,
    tenantId: string,
    email: string,
    role: Role,
    dto: AcceptInvitationDto,
  ): Promise<{ id: string; email: string; name: string; role: Role; tenantId: string }> {
    // Load invitation using base client (no tenant filter — public endpoint)
    const invitation = await this.basePrisma.invitation.findUnique({
      where: { id: invitationId },
    })

    if (!invitation || invitation.tenantId !== tenantId || invitation.email !== email) {
      throw new DomainException('Invalid or expired invitation', 'INVALID_INVITATION', 401)
    }

    if (invitation.acceptedAt) {
      throw new DomainException('This invitation has already been used', 'INVITATION_USED', 409)
    }

    if (invitation.expiresAt < new Date()) {
      throw new DomainException('This invitation has expired', 'INVITATION_EXPIRED', 410)
    }

    // Guard: another user may have registered with this email between invite
    // send and accept (unlikely but possible in multi-admin tenants)
    const alreadyMember = await this.basePrisma.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
      select: { id: true },
    })
    if (alreadyMember) {
      throw new DomainException(
        `${email} is already a member of this workspace`,
        'EMAIL_ALREADY_MEMBER',
        409,
      )
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)

    const { user } = await this.basePrisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          tenantId,
          email,
          name: dto.name,
          passwordHash,
          role,
        },
      })

      await tx.invitation.update({
        where: { id: invitationId },
        data: { acceptedAt: new Date() },
      })

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: newUser.id,
          action: 'ACCEPT_INVITATION',
          entityType: 'User',
          entityId: newUser.id,
          after: { email, role, invitationId },
        },
      })

      return { user: newUser }
    })

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
    }
  }

  // ── Static helper ──────────────────────────────────────────────────────────

  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }
}
