import type { FastifyPluginAsync } from 'fastify'
import authRoutes from './auth'
import assetRoutes from './assets'
import invitationRoutes from './invitations'
import locationRoutes from './locations'
import meRoute from './me'
import workOrderRoutes from './work-orders'
import pmScheduleRoutes from './pm-schedules/index.js'
import failureCodeRoutes from './failure-codes/index.js'
import partsRoutes from './parts/index.js'
import notificationsRoutes from './notifications/index.js'
import permitRoutes from './permits/index.js'
import siteRoutes from './sites/index.js'
import contractorRoutes from './contractor/index.js'

/**
 * Mounts all v1 API routes under /api/v1.
 * Auth routes are public; every other route plugin is responsible for
 * attaching authenticate or requireRole as a preHandler.
 */
const v1Router: FastifyPluginAsync = async (fastify) => {
  void fastify.register(authRoutes, { prefix: '/auth' })
  void fastify.register(meRoute)
  void fastify.register(invitationRoutes, { prefix: '/invitations' })
  void fastify.register(workOrderRoutes, { prefix: '/work-orders' })
  void fastify.register(assetRoutes, { prefix: '/assets' })
  void fastify.register(locationRoutes, { prefix: '/locations' })
  void fastify.register(pmScheduleRoutes, { prefix: '/pm-schedules' })
  void fastify.register(failureCodeRoutes, { prefix: '/failure-codes' })
  void fastify.register(partsRoutes, { prefix: '/parts' })
  void fastify.register(notificationsRoutes, { prefix: '/notifications' })
  void fastify.register(permitRoutes, { prefix: '/permits' })
  void fastify.register(siteRoutes, { prefix: '/sites' })
  void fastify.register(contractorRoutes, { prefix: '/contractor' })
}

export default v1Router
