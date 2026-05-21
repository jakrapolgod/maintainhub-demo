/**
 * Comment routes — threaded discussion on a work order.
 *
 * POST /:id/comments — create a comment, emit Socket.io event to room wo:{id}
 * GET  /:id/comments — list comments, newest first
 *
 * ## Mentions
 * Clients may supply an explicit `mentions` array of user IDs AND/OR embed
 * @userId markers in the content string.  Both sources are merged into a
 * deduplicated list that is emitted in the Socket.io payload so the browser
 * can highlight / notify mentioned users client-side.
 *
 * Mentions are NOT persisted in a separate column (the schema has none);
 * they live only in the real-time event payload.  If persistent @-mention
 * tracking is needed, add a `mentions String[]` column to the Comment model.
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../../../middleware/require-permission.js'
import { writeAuditLog } from '../../../application/work-orders/commands/command.types.js'
import { idParam, errorBody } from './route-helpers.js'
import type { OASSchema } from './route-helpers.js'

// ── Zod schema ────────────────────────────────────────────────────────────────

const commentBodySchema = z.object({
  content:  z.string().trim().min(1, 'Comment cannot be empty').max(2_000),
  mentions: z.array(z.string().cuid()).optional(),
})

// ── @mention extraction ───────────────────────────────────────────────────────

/**
 * Extract @userId mentions embedded in a comment body.
 * Matches any @<cuid> token (cuid is 24+ lowercase alphanumeric chars).
 */
function extractMentions(content: string): string[] {
  const re    = /@([a-z0-9]{20,})/g
  const found: string[] = []
  let m = re.exec(content)
  while (m !== null) {
    found.push(m[1] as string)
    m = re.exec(content)
  }
  return found
}

type IdParam = { Params: { id: string } }

// ── Plugin ────────────────────────────────────────────────────────────────────

const commentRoutes: FastifyPluginAsync = async (fastify) => {

  // ── POST /:id/comments ─────────────────────────────────────────────────────
  fastify.post<IdParam>(
    '/:id/comments',
    {
      schema: {
        description: 'Post a comment on the work order. Emits a real-time Socket.io event to room wo:{id}.',
        tags:     ['work-orders'],
        security: [{ bearerAuth: [] }],
        params:   idParam,
        body: {
          type: 'object',
          required: ['content'],
          properties: {
            content:  { type: 'string', minLength: 1, maxLength: 2000 },
            mentions: { type: 'array', items: { type: 'string' },
                        description: 'User IDs to notify (merged with @mentions in content)' },
          },
          additionalProperties: false,
        },
        response: {
          201: { type: 'object',
            properties: {
              id:        { type: 'string' },
              body:      { type: 'string' },
              authorId:  { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
          401: { description: 'Unauthorised',   ...errorBody },
          403: { description: 'Forbidden',       ...errorBody },
          404: { description: 'WO not found',   ...errorBody },
          422: { description: 'Validation error', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'add-comment'),
    },
    async (request, reply) => {
      const { content, mentions: explicitMentions } = commentBodySchema.parse(request.body)
      const woId     = request.params.id
      const authorId = request.user.sub
      const tenantId = request.user.tid

      // Verify work order exists in this tenant
      const wo = await request.db.workOrder.findFirst({
        where:  { id: woId, deletedAt: null },
        select: { id: true },
      })
      if (!wo) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Work order not found' })
      }

      // Merge explicit mentions with @-markers in body
      const inlineMentions = extractMentions(content)
      const allMentions    = [...new Set([...(explicitMentions ?? []), ...inlineMentions])]

      // Persist comment
      const commentId = randomUUID()
      const comment   = await request.server.prisma.comment.create({
        data: {
          id:          commentId,
          workOrderId: woId,
          authorId,
          body:        content,
        },
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      })

      // Write audit log (non-fatal)
      const ua = request.headers['user-agent']
      await writeAuditLog(request.server.prisma, {
        tenantId,
        userId:     authorId,
        action:     'ADD_COMMENT',
        entityType: 'WorkOrder',
        entityId:   woId,
        after:      { commentId, content: content.slice(0, 200) },
        ipAddress:  request.ip ?? null,
        userAgent:  typeof ua === 'string' ? ua : null,
      })

      // Emit real-time event to all clients in the WO room
      const payload = {
        workOrderId: woId,
        comment: {
          id:              comment.id,
          body:            comment.body,
          authorId:        comment.authorId,
          authorName:      comment.author.name,
          authorAvatarUrl: comment.author.avatarUrl ?? null,
          mentions:        allMentions,
          createdAt:       comment.createdAt.toISOString(),
        },
      }
      request.server.io.to(`wo:${woId}`).emit('comment:added', payload)

      return reply.status(201).send({
        id:        comment.id,
        body:      comment.body,
        authorId:  comment.authorId,
        createdAt: comment.createdAt.toISOString(),
      })
    },
  )

  // ── GET /:id/comments ──────────────────────────────────────────────────────
  fastify.get<IdParam>(
    '/:id/comments',
    {
      schema: {
        description: 'List all comments for a work order, newest first.',
        tags:     ['work-orders'],
        security: [{ bearerAuth: [] }],
        params:   idParam,
        response: {
          200: { type: 'array',
            items: { type: 'object' },
          },
          401: { description: 'Unauthorised', ...errorBody },
          404: { description: 'Not found',    ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'read'),
    },
    async (request, reply) => {
      const rows = await request.server.prisma.comment.findMany({
        where:   { workOrderId: request.params.id },
        orderBy: { createdAt: 'desc' },
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      })

      const items = rows.map((r) => ({
        id:              r.id,
        body:            r.body,
        authorId:        r.authorId,
        authorName:      r.author.name,
        authorAvatarUrl: r.author.avatarUrl ?? null,
        createdAt:       r.createdAt.toISOString(),
        updatedAt:       r.updatedAt.toISOString(),
      }))

      return reply.send(items)
    },
  )
}

export default commentRoutes
