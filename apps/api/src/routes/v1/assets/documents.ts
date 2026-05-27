/**
 * Asset document routes — file upload, listing, and deletion.
 *
 * GET    /:id/documents        — list with signed URLs
 * POST   /:id/documents        — multipart upload (max 50 MB)
 * DELETE /:id/documents/:docId — delete document + MinIO object
 *
 * ## Storage layout
 *   MinIO key: assets/{tenantId}/{assetId}/{uuid}-{sanitisedFilename}
 *
 * ## Allowed MIME types
 *   images, PDF, Word (.doc/.docx), Excel (.xls/.xlsx), plain text
 */
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { FastifyPluginAsync } from 'fastify'
import multipart from '@fastify/multipart'
import { DomainException } from '../../../errors/domain.exception.js'
import { requirePermission } from '../../../middleware/require-permission.js'
import { writeAuditLog } from '../../../application/assets/commands/command.types.js'
import { assetIdParam, errorBody } from './route-helpers.js'
import type { OASSchema } from './route-helpers.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB
const PRESIGN_TTL = 3_600 // 1 hour

const ALLOWED_MIME_PREFIXES = ['image/']
const ALLOWED_MIME_EXACT = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
])

function isMimeAllowed(mime: string): boolean {
  if (ALLOWED_MIME_EXACT.has(mime)) return true
  return ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const documentRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(multipart, {
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fieldSize: 0 },
  })

  // ── GET /:id/documents ─────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/:id/documents',
    {
      schema: {
        description: 'List documents attached to an asset with 1-hour presigned download URLs.',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        params: assetIdParam,
        response: {
          200: { type: 'array', items: { type: 'object', additionalProperties: true } },
          401: { description: 'Unauthorised', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'read'),
    },
    async (request, reply) => {
      const rows = await request.db.attachment.findMany({
        where: { assetId: request.params.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          storageKey: true,
          createdAt: true,
          uploadedById: true,
          uploadedBy: { select: { name: true } },
        },
      })

      const items = await Promise.all(
        rows.map(async (r) => {
          let signedUrl = ''
          try {
            signedUrl = await request.server.minio.presignedGetObject(
              request.server.minioBucket,
              r.storageKey,
              PRESIGN_TTL,
            )
          } catch {
            /* non-fatal */
          }

          return {
            id: r.id,
            fileName: r.fileName,
            fileSize: r.fileSize,
            mimeType: r.mimeType,
            storageKey: r.storageKey,
            uploadedById: r.uploadedById,
            uploadedByName: r.uploadedBy.name,
            uploadedAt: r.createdAt.toISOString(),
            signedUrl,
          }
        }),
      )

      return reply.send(items)
    },
  )

  // ── POST /:id/documents ────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    '/:id/documents',
    {
      schema: {
        description:
          'Upload a document to an asset (max 50 MB). Stored in MinIO, metadata saved to DB.',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        params: assetIdParam,
        body: {
          type: 'object',
          properties: { file: { type: 'string', format: 'binary' } },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              fileName: { type: 'string' },
              fileSize: { type: 'integer' },
              signedUrl: { type: 'string' },
            },
          },
          400: { description: 'No file / invalid MIME', ...errorBody },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Asset not found', ...errorBody },
          413: { description: 'File exceeds 50 MB', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'update'),
    },
    async (request, reply) => {
      const assetId = request.params.id
      const tenantId = request.user.tid
      const userId = request.user.sub

      // Verify asset exists
      const asset = await request.db.asset.findFirst({
        where: { id: assetId, deletedAt: null },
        select: { id: true },
      })
      if (!asset) throw new DomainException('Asset not found', 'NOT_FOUND', 404)

      // Parse multipart
      let filePart
      try {
        filePart = await request.file()
      } catch {
        throw new DomainException('Request must be multipart/form-data', 'INVALID_REQUEST', 400)
      }
      if (!filePart) throw new DomainException('No file uploaded', 'NO_FILE', 400)

      const { mimetype, filename: rawFilename, file: fileStream } = filePart

      if (!isMimeAllowed(mimetype)) {
        fileStream.resume()
        throw new DomainException(
          `File type "${mimetype}" is not allowed`,
          'INVALID_MIME_TYPE',
          400,
        )
      }

      const ext = path.extname(rawFilename ?? '').toLowerCase() || ''
      const storageKey = `assets/${tenantId}/${assetId}/${randomUUID()}${ext}`
      const fileName = rawFilename ?? `document${ext}`

      let bytesUploaded = 0
      try {
        await request.server.minio.putObject(
          request.server.minioBucket,
          storageKey,
          fileStream,
          undefined,
          { 'Content-Type': mimetype, 'x-tenant-id': tenantId },
        )
        bytesUploaded = fileStream.bytesRead
      } catch (err) {
        throw new DomainException(
          `Upload failed: ${err instanceof Error ? err.message : 'unknown'}`,
          'UPLOAD_FAILED',
          502,
        )
      }

      const record = await request.server.prisma.attachment.create({
        data: {
          tenantId,
          assetId,
          uploadedById: userId,
          fileName,
          fileSize: bytesUploaded,
          mimeType: mimetype,
          storageKey,
        },
      })

      const ua = request.headers['user-agent']
      await writeAuditLog(request.server.prisma, {
        tenantId,
        userId,
        action: 'UPLOAD_ASSET_DOCUMENT',
        entityType: 'Asset',
        entityId: assetId,
        after: { documentId: record.id, fileName, mimeType: mimetype, fileSize: bytesUploaded },
        ipAddress: request.ip ?? null,
        userAgent: typeof ua === 'string' ? ua : null,
      })

      let signedUrl = ''
      try {
        signedUrl = await request.server.minio.presignedGetObject(
          request.server.minioBucket,
          storageKey,
          PRESIGN_TTL,
        )
      } catch {
        /* non-fatal */
      }

      return reply.status(201).send({
        id: record.id,
        fileName: record.fileName,
        fileSize: record.fileSize,
        mimeType: record.mimeType,
        storageKey: record.storageKey,
        uploadedAt: record.createdAt.toISOString(),
        signedUrl,
      })
    },
  )

  // ── DELETE /:id/documents/:docId ───────────────────────────────────────────
  fastify.delete<{ Params: { id: string; docId: string } }>(
    '/:id/documents/:docId',
    {
      schema: {
        description: 'Delete an asset document (removes from MinIO and DB).',
        tags: ['assets'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'docId'],
          properties: {
            id: { type: 'string' },
            docId: { type: 'string' },
          },
        },
        response: {
          204: { type: 'null' },
          401: { description: 'Unauthorised', ...errorBody },
          403: { description: 'Forbidden', ...errorBody },
          404: { description: 'Not found', ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('asset', 'update'),
    },
    async (request, reply) => {
      const { id: assetId, docId } = request.params
      const tenantId = request.user.tid
      const userId = request.user.sub

      const record = await request.db.attachment.findFirst({
        where: { id: docId, assetId },
        select: { id: true, storageKey: true, fileName: true },
      })
      if (!record) throw new DomainException('Document not found', 'NOT_FOUND', 404)

      // Delete from MinIO first (if it fails, don't delete the DB row)
      try {
        await request.server.minio.removeObject(request.server.minioBucket, record.storageKey)
      } catch {
        // Non-fatal — object may already be gone; still delete DB row
      }

      await request.server.prisma.attachment.delete({ where: { id: docId } })

      const ua = request.headers['user-agent']
      await writeAuditLog(request.server.prisma, {
        tenantId,
        userId,
        action: 'DELETE_ASSET_DOCUMENT',
        entityType: 'Asset',
        entityId: assetId,
        before: { documentId: docId, fileName: record.fileName },
        ipAddress: request.ip ?? null,
        userAgent: typeof ua === 'string' ? ua : null,
      })

      return reply.status(204).send()
    },
  )
}

export default documentRoutes
