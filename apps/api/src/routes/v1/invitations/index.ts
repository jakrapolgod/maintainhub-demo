import { randomUUID } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import type { Role } from '@prisma/client'
import { DomainException } from '../../../errors/domain.exception'
import { auditFrom } from '../../../lib/audit'
import { requirePermission } from '../../../middleware/require-permission'
import { AcceptInvitationSchema, SendInvitationSchema } from '../../../schemas/invitation'
import { InvitationService } from '../../../services/invitation.service'

const INVITE_TTL = '48h'

const invitationRoutes: FastifyPluginAsync = async (fastify) => {
  // ── POST /invitations ─────────────────────────────────────────────────────
  // Send an invitation email with a signed JWT link.
  // Requires user:invite permission (ADMIN or MANAGER).
  fastify.post(
    '/',
    {
      preHandler: requirePermission('user', 'invite'),
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const dto = SendInvitationSchema.parse(request.body)
      const { sub: inviterId, tid: tenantId, slug, email: inviterEmail } = request.user

      // Pre-generate the invitation ID so we can embed it in the JWT before
      // the DB write — avoids a second round-trip to fetch the created row ID.
      const invitationId = randomUUID()

      // Build the JWT (no DB call yet — we need the ID first)
      const token = fastify.jwt.sign(
        {
          sub: dto.email,
          tid: tenantId,
          role: dto.role as Role,
          email: dto.email,
          slug,
          iid: invitationId,
          typ: 'invitation',
        },
        { expiresIn: INVITE_TTL },
      )

      const tokenHash = InvitationService.hashToken(token)

      // Persist invitation; validates no duplicate active member
      const svc = new InvitationService(request.db, fastify.prisma, tenantId)
      const invitation = await svc.prepare(dto, inviterId, invitationId, tokenHash)

      // Load tenant info needed for the email template
      const tenant = await request.db.tenant.findFirst({
        where: {},
        select: { name: true },
      })

      // Load inviter display name
      const inviter = await fastify.prisma.user.findUnique({
        where: { id: inviterId },
        select: { name: true },
      })

      const acceptUrl = `${fastify.config.APP_URL}/accept-invitation?token=${encodeURIComponent(token)}`

      // Send email — graceful in development if SMTP isn't reachable
      const emailSent = await fastify.email
        .sendInvitation({
          to: dto.email,
          inviterName: inviter?.name ?? inviterEmail,
          tenantName: tenant?.name ?? 'MaintainHub',
          role: dto.role,
          acceptUrl,
          expiresAt: invitation.expiresAt,
        })
        .then(() => true)
        .catch((err: unknown) => {
          request.log.warn(
            { err, to: dto.email },
            'Invitation email delivery failed — invitation record created but email not sent',
          )
          return false
        })

      request.log.info(
        { invitationId, to: dto.email, role: dto.role, emailSent },
        'Invitation sent',
      )

      const { ipAddress, userAgent } = auditFrom(request)
      await fastify.prisma.auditLog.create({
        data: {
          tenantId,
          userId: inviterId,
          action: 'SEND_INVITATION',
          entityType: 'Invitation',
          entityId: invitationId,
          after: { email: dto.email, role: dto.role },
          ipAddress,
          userAgent,
        },
      })

      return reply.status(201).send({
        message: `Invitation sent to ${dto.email}`,
        email: dto.email,
        role: dto.role,
        expiresAt: invitation.expiresAt.toISOString(),
        emailDelivered: emailSent,
        // Expose token in non-production so developers can test without SMTP
        ...(fastify.config.NODE_ENV !== 'production' && { devToken: token }),
      })
    },
  )

  // ── POST /invitations/:token/accept ───────────────────────────────────────
  // Public endpoint — the JWT in :token is the auth proof.
  // Verifies the token, creates the user account, returns access credentials.
  fastify.post<{ Params: { token: string } }>(
    '/:token/accept',
    {
      config: {
        skipAuth: true,
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const { token } = request.params
      const dto = AcceptInvitationSchema.parse(request.body)

      // Verify JWT signature and expiry
      let payload: { sub: string; tid: string; role: Role; iid?: string; typ?: string }
      try {
        payload = fastify.jwt.verify(token) as typeof payload
      } catch {
        throw new DomainException('Invalid or expired invitation link', 'INVALID_INVITATION', 401)
      }

      // Reject if this is not an invitation token (prevents access tokens being reused)
      if (payload.typ !== 'invitation' || !payload.iid) {
        throw new DomainException('Invalid invitation token', 'INVALID_INVITATION', 401)
      }

      const svc = new InvitationService(
        // Accept flow uses the base client — tenant isolation is provided by
        // the JWT payload which pins tenantId and email
        request.db as never,
        fastify.prisma,
        payload.tid,
      )

      const user = await svc.accept(
        payload.iid,
        payload.tid,
        payload.sub, // email
        payload.role,
        dto,
      )

      // Issue a fresh access + refresh token pair so the user is logged in immediately
      const accessToken = fastify.jwt.sign({
        sub: user.id,
        tid: user.tenantId,
        role: user.role,
        email: user.email,
        slug: payload.tid, // slug not in invitation JWT; use tenantId as fallback
      })

      return reply.status(201).send({
        message: 'Account created successfully',
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
        },
      })
    },
  )
}

export default invitationRoutes
