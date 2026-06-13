/**
 * Multi-site management routes.
 *
 * GET    /sites                          — list sites (ADMIN: all, MANAGER: own)
 * POST   /sites                          — create site (ADMIN only)
 * GET    /sites/:id                      — get site detail
 * PATCH  /sites/:id                      — update site (ADMIN only)
 * POST   /sites/:id/assign-user          — assign a user to this site (ADMIN/MANAGER)
 * DELETE /sites/:id/users/:userId        — remove user from site
 *
 * Multi-site isolation:
 *   ADMIN  → sees all sites in the tenant
 *   MANAGER → sees only sites they are assigned to (via UserSite)
 */
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../../../middleware/require-permission.js'
import { DomainException } from '../../../errors/domain.exception.js'
import type { OASSchema } from '../work-orders/route-helpers.js'

const createSiteSchema = z.object({
  name: z.string().min(2).max(100),
  code: z.string().min(1).max(20).toUpperCase(),
  address: z.string().max(500).optional(),
})

const updateSiteSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  address: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
})

const assignUserSchema = z.object({
  userId: z.string().cuid(),
})

const siteRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET /sites ─────────────────────────────────────────────────────────────
  fastify.get(
    '/',
    {
      schema: {
        description: 'List sites. ADMIN sees all; MANAGER sees only assigned sites.',
        tags: ['sites'],
        security: [{ bearerAuth: [] }],
      } as OASSchema,
      preHandler: requirePermission('work-order', 'read'),
    },
    async (request, reply) => {
      const { role, sub: userId } = request.user

      if (role === 'ADMIN') {
        // ADMIN sees every site in the tenant
        const sites = await request.db.site.findMany({
          orderBy: { name: 'asc' },
          include: {
            _count: { select: { assets: true, workOrders: true, userSites: true } },
          },
        })
        return reply.send({ sites })
      }

      if (role === 'MANAGER') {
        // MANAGER sees only sites they are assigned to
        const userSites = await request.server.prisma.userSite.findMany({
          where: { userId },
          select: { siteId: true },
        })
        const siteIds = userSites.map((us) => us.siteId)
        const sites = await request.db.site.findMany({
          where: { id: { in: siteIds } },
          orderBy: { name: 'asc' },
          include: {
            _count: { select: { assets: true, workOrders: true, userSites: true } },
          },
        })
        return reply.send({ sites })
      }

      // Other roles get an empty list (they don't manage sites)
      return reply.send({ sites: [] })
    },
  )

  // ── POST /sites ────────────────────────────────────────────────────────────
  fastify.post(
    '/',
    {
      schema: { tags: ['sites'], security: [{ bearerAuth: [] }] } as OASSchema,
      preHandler: requirePermission('work-order', 'create'),
    },
    async (request, reply) => {
      if (request.user.role !== 'ADMIN') {
        throw new DomainException('Only ADMIN can create sites', 'FORBIDDEN', 403)
      }

      const body = createSiteSchema.parse(request.body)
      const site = await request.db.site.create({
        data: {
          tenantId: request.user.tid,
          name: body.name,
          code: body.code,
          ...(body.address !== undefined && { address: body.address }),
        },
      })
      return reply.status(201).send(site)
    },
  )

  // ── GET /sites/:id ─────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: { tags: ['sites'], security: [{ bearerAuth: [] }] } as OASSchema,
      preHandler: requirePermission('work-order', 'read'),
    },
    async (request, reply) => {
      const site = await request.db.site.findFirst({
        where: { id: request.params.id },
        include: {
          userSites: {
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
          },
          _count: { select: { assets: true, workOrders: true } },
        },
      })
      if (!site) throw new DomainException('Site not found', 'NOT_FOUND', 404)

      // MANAGER can only view their own sites
      if (request.user.role === 'MANAGER') {
        const isMember = site.userSites.some((us) => us.userId === request.user.sub)
        if (!isMember) throw new DomainException('Forbidden', 'FORBIDDEN', 403)
      }

      return reply.send(site)
    },
  )

  // ── PATCH /sites/:id ───────────────────────────────────────────────────────
  fastify.patch<{ Params: { id: string } }>(
    '/:id',
    {
      schema: { tags: ['sites'], security: [{ bearerAuth: [] }] } as OASSchema,
      preHandler: requirePermission('work-order', 'update'),
    },
    async (request, reply) => {
      if (request.user.role !== 'ADMIN') {
        throw new DomainException('Only ADMIN can update sites', 'FORBIDDEN', 403)
      }

      const body = updateSiteSchema.parse(request.body)
      const site = await request.db.site.findFirst({ where: { id: request.params.id } })
      if (!site) throw new DomainException('Site not found', 'NOT_FOUND', 404)

      const updated = await request.db.site.update({
        where: { id: site.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.address !== undefined && { address: body.address }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      })
      return reply.send(updated)
    },
  )

  // ── POST /sites/:id/assign-user ────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/:id/assign-user',
    {
      schema: { tags: ['sites'], security: [{ bearerAuth: [] }] } as OASSchema,
      preHandler: requirePermission('work-order', 'assign'),
    },
    async (request, reply) => {
      const { userId } = assignUserSchema.parse(request.body)

      const site = await request.db.site.findFirst({ where: { id: request.params.id } })
      if (!site) throw new DomainException('Site not found', 'NOT_FOUND', 404)

      // Verify the user belongs to the same tenant
      const user = await request.db.user.findFirst({
        where: { id: userId },
        select: { id: true, role: true },
      })
      if (!user) throw new DomainException('User not found', 'NOT_FOUND', 404)

      await request.server.prisma.userSite.upsert({
        where: { userId_siteId: { userId, siteId: site.id } },
        create: { userId, siteId: site.id },
        update: {},
      })

      return reply.status(204).send()
    },
  )

  // ── DELETE /sites/:id/users/:userId ───────────────────────────────────────
  fastify.delete<{ Params: { id: string; userId: string } }>(
    '/:id/users/:userId',
    {
      schema: { tags: ['sites'], security: [{ bearerAuth: [] }] } as OASSchema,
      preHandler: requirePermission('work-order', 'assign'),
    },
    async (request, reply) => {
      await request.server.prisma.userSite.deleteMany({
        where: { userId: request.params.userId, siteId: request.params.id },
      })
      return reply.status(204).send()
    },
  )
}

export default siteRoutes
