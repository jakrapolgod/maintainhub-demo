/**
 * Asset QR code and label routes.
 *
 * GET  /:id/qr         — raw QR code PNG
 * GET  /:id/label      — label PNG (QR + asset number + name)
 * POST /labels/bulk    — body: { assetIds[] } → ZIP archive of PNGs
 *
 * All responses are binary (not JSON). These endpoints bypass the standard
 * JSON serialiser and write raw Buffer / stream to the reply.
 */
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { DomainException } from '../../../errors/domain.exception.js'
import { requirePermission } from '../../../middleware/require-permission.js'
import { QRCodeService } from '../../../infrastructure/assets/index.js'
import { assetIdParam, errorBody } from './route-helpers.js'
import type { OASSchema } from './route-helpers.js'

// ── Zod schemas ───────────────────────────────────────────────────────────────

const bulkLabelBodySchema = z.object({
  assetIds: z.array(z.string().cuid()).min(1).max(200),
})

// ── Plugin ────────────────────────────────────────────────────────────────────

const qrRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET /:id/qr ────────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id/qr',
    {
      schema: {
        description: 'Generate a QR code PNG for the asset canonical URL.',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        params: assetIdParam,
        response: {
          200: { type: 'string', format: 'binary', description: 'PNG image' },
          401: { description: 'Unauthorised', ...errorBody },
          404: { description: 'Asset not found', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'read'),
    },
    async (request, reply) => {
      const asset = await request.db.asset.findFirst({
        where: { id: request.params.id, deletedAt: null },
        select: { id: true, tenantId: true },
        // tenant filter provides tenantId
      })
      if (!asset) throw new DomainException('Asset not found', 'NOT_FOUND', 404)

      // Use tenant slug from JWT (tid = tenantId; slug is in JWT.slug)
      const tenantSlug = request.user.slug

      const png = await QRCodeService.generateQRCode(asset.id, tenantSlug)
      return reply
        .header('Content-Type', 'image/png')
        .header('Cache-Control', 'public, max-age=86400')
        .send(png)
    },
  )

  // ── GET /:id/label ─────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id/label',
    {
      schema: {
        description: 'Generate a printable label PNG (QR + asset number + name, 350×150 px).',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        params: assetIdParam,
        response: {
          200: { type: 'string', format: 'binary', description: 'PNG image' },
          401: { description: 'Unauthorised', ...errorBody },
          404: { description: 'Asset not found', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'read'),
    },
    async (request, reply) => {
      const asset = await request.db.asset.findFirst({
        where: { id: request.params.id, deletedAt: null },
        select: { id: true, assetNumber: true, name: true },
      })
      if (!asset) throw new DomainException('Asset not found', 'NOT_FOUND', 404)

      const png = await QRCodeService.generateLabel({
        id: asset.id,
        assetNumber: asset.assetNumber,
        name: asset.name,
        tenantSlug: request.user.slug,
      })

      return reply
        .header('Content-Type', 'image/png')
        .header('Content-Disposition', `attachment; filename="${asset.assetNumber}_label.png"`)
        .send(png)
    },
  )

  // ── POST /labels/bulk ──────────────────────────────────────────────────────
  // NOTE: /labels/bulk must be registered before /:id routes are mounted to
  // avoid being captured by the param pattern.  The index.ts registers qrRoutes
  // before crudRoutes to guarantee this ordering.
  fastify.post(
    '/labels/bulk',
    {
      schema: {
        description: 'Generate a ZIP of label PNGs for up to 200 assets.',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['assetIds'],
          properties: {
            assetIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 200 },
          },
          additionalProperties: false,
        },
        response: {
          200: { type: 'string', format: 'binary', description: 'ZIP archive' },
          400: { description: 'Validation error', ...errorBody },
          401: { description: 'Unauthorised', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'read'),
    },
    async (request, reply) => {
      const { assetIds } = bulkLabelBodySchema.parse(request.body)
      const tenantSlug = request.user.slug

      // Load only the assets that exist in this tenant
      const rows = await request.db.asset.findMany({
        where: { id: { in: assetIds }, deletedAt: null },
        select: { id: true, assetNumber: true, name: true },
      })

      if (rows.length === 0) {
        throw new DomainException('No matching assets found', 'NOT_FOUND', 404)
      }

      const labelAssets = rows.map((r) => ({
        id: r.id,
        assetNumber: r.assetNumber,
        name: r.name,
        tenantSlug,
      }))

      const zip = await QRCodeService.bulkGenerateLabels(labelAssets)

      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', 'attachment; filename="asset_labels.zip"')
        .send(zip)
    },
  )
}

export default qrRoutes
