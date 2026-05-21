/**
 * Attachment routes — file upload and listing for work orders.
 *
 * POST /:id/attachments — multipart upload → MinIO → DB record
 * GET  /:id/attachments — list attachments with presigned download URLs
 *
 * ## Limits
 *  - Max file size: 20 MB (enforced by @fastify/multipart before reading the stream)
 *  - Allowed MIME types: image/*, application/pdf, application/msword,
 *    application/vnd.openxmlformats-officedocument.wordprocessingml.document
 *
 * ## Storage layout
 *  MinIO key: attachments/{tenantId}/{workOrderId}/{uuid}.{ext}
 *
 * ## Presigned URLs
 *  Download URLs are valid for 1 hour. Clients should not cache them beyond TTL.
 */
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { FastifyPluginAsync } from 'fastify'
import multipart from '@fastify/multipart'
import { DomainException } from '../../../errors/domain.exception.js'
import { requirePermission } from '../../../middleware/require-permission.js'
import { writeAuditLog } from '../../../application/work-orders/commands/command.types.js'
import { idParam, errorBody } from './route-helpers.js'
import type { OASSchema } from './route-helpers.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES      = 20 * 1024 * 1024       // 20 MB
const PRESIGN_TTL_SECONDS = 3_600                  // 1 hour
const STORAGE_PREFIX      = 'attachments'

const ALLOWED_MIME_PREFIXES  = ['image/']
const ALLOWED_MIME_EXACT     = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function isMimeAllowed(mime: string): boolean {
  if (ALLOWED_MIME_EXACT.has(mime)) return true
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))
}

type IdParam = { Params: { id: string } }

// ── Plugin ────────────────────────────────────────────────────────────────────

const attachmentRoutes: FastifyPluginAsync = async (fastify) => {
  // Register multipart plugin scoped to this sub-plugin only
  await fastify.register(multipart, {
    limits: {
      fileSize:  MAX_FILE_BYTES,
      files:     1,            // one file per request
      fieldSize: 0,            // no text fields
    },
  })

  // ── POST /:id/attachments ──────────────────────────────────────────────────
  fastify.post<IdParam>(
    '/:id/attachments',
    {
      schema: {
        description: 'Upload a file attachment (image, PDF, or Word doc, max 20 MB) to a work order.',
        tags:     ['work-orders'],
        security: [{ bearerAuth: [] }],
        params:   idParam,
        // Body is multipart/form-data — JSON Schema describes the form fields
        body: {
          type: 'object',
          properties: {
            file: { type: 'string', format: 'binary', description: 'File to upload (max 20 MB)' },
          },
        },
        response: {
          201: { type: 'object',
            properties: {
              id:          { type: 'string' },
              fileName:    { type: 'string' },
              fileSize:    { type: 'integer' },
              mimeType:    { type: 'string' },
              storageKey:  { type: 'string' },
              downloadUrl: { type: 'string', description: 'Presigned GET URL (valid 1 hour)' },
              uploadedAt:  { type: 'string' },
            },
          },
          400: { description: 'No file / invalid MIME type', ...errorBody },
          401: { description: 'Unauthorised',                ...errorBody },
          403: { description: 'Forbidden',                   ...errorBody },
          404: { description: 'WO not found',                ...errorBody },
          413: { description: 'File exceeds 20 MB limit',    ...errorBody },
        },
      } as OASSchema,
      preHandler: requirePermission('work-order', 'read'),
    },
    async (request, reply) => {
      const woId     = request.params.id
      const authorId = request.user.sub
      const tenantId = request.user.tid

      // Verify work order exists in tenant
      const wo = await request.db.workOrder.findFirst({
        where:  { id: woId, deletedAt: null },
        select: { id: true },
      })
      if (!wo) {
        throw new DomainException('Work order not found', 'NOT_FOUND', 404)
      }

      // Parse the multipart file part
      let filePart
      try {
        filePart = await request.file()
      } catch {
        throw new DomainException(
          'Request must be multipart/form-data with a single file field',
          'INVALID_REQUEST',
          400,
        )
      }

      if (!filePart) {
        throw new DomainException('No file uploaded', 'NO_FILE', 400)
      }

      // Validate MIME type before streaming to MinIO
      const { mimetype, filename: rawFilename, file: fileStream } = filePart
      if (!isMimeAllowed(mimetype)) {
        // Consume the stream to avoid leaving it open, then reject
        fileStream.resume()
        throw new DomainException(
          `File type "${mimetype}" is not allowed. Permitted: images, PDF, Word documents.`,
          'INVALID_MIME_TYPE',
          400,
        )
      }

      // Build the MinIO storage key
      const ext        = path.extname(rawFilename ?? '').toLowerCase() || ''
      const objectUuid = randomUUID()
      const storageKey = `${STORAGE_PREFIX}/${tenantId}/${woId}/${objectUuid}${ext}`
      const fileName   = rawFilename ?? `attachment${ext}`

      // Stream directly to MinIO (no local temp file)
      let bytesUploaded = 0
      try {
        await request.server.minio.putObject(
          request.server.minioBucket,
          storageKey,
          fileStream,
          undefined,     // size unknown — MinIO will use chunked transfer
          { 'Content-Type': mimetype, 'x-tenant-id': tenantId },
        )
        // fileStream.bytesRead is populated by busboy after the stream ends
        bytesUploaded = fileStream.bytesRead
      } catch (err) {
        throw new DomainException(
          `Storage upload failed: ${err instanceof Error ? err.message : 'unknown error'}`,
          'UPLOAD_FAILED',
          502,
        )
      }

      // Persist Attachment record
      const attachment = await request.server.prisma.attachment.create({
        data: {
          tenantId,
          workOrderId:  woId,
          uploadedById: authorId,
          fileName,
          fileSize:     bytesUploaded,
          mimeType:     mimetype,
          storageKey,
        },
      })

      // Audit log (non-fatal)
      const ua = request.headers['user-agent']
      await writeAuditLog(request.server.prisma, {
        tenantId,
        userId:     authorId,
        action:     'ADD_ATTACHMENT',
        entityType: 'WorkOrder',
        entityId:   woId,
        after:      { attachmentId: attachment.id, fileName, mimeType: mimetype, fileSize: bytesUploaded },
        ipAddress:  request.ip ?? null,
        userAgent:  typeof ua === 'string' ? ua : null,
      })

      // Generate presigned download URL
      const downloadUrl = await request.server.minio.presignedGetObject(
        request.server.minioBucket,
        storageKey,
        PRESIGN_TTL_SECONDS,
      )

      return reply.status(201).send({
        id:          attachment.id,
        fileName:    attachment.fileName,
        fileSize:    attachment.fileSize,
        mimeType:    attachment.mimeType,
        storageKey:  attachment.storageKey,
        downloadUrl,
        uploadedAt:  attachment.createdAt.toISOString(),
      })
    },
  )

  // ── GET /:id/attachments ───────────────────────────────────────────────────
  fastify.get<IdParam>(
    '/:id/attachments',
    {
      schema: {
        description: 'List attachments for a work order with fresh presigned download URLs (valid 1 hour).',
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
      const rows = await request.db.attachment.findMany({
        where:   { workOrderId: request.params.id },
        orderBy: { createdAt: 'asc' },
        include: { uploadedBy: { select: { id: true, name: true } } },
      })

      // Generate presigned URLs in parallel
      const items = await Promise.all(
        rows.map(async (r) => {
          let downloadUrl: string
          try {
            downloadUrl = await request.server.minio.presignedGetObject(
              request.server.minioBucket,
              r.storageKey,
              PRESIGN_TTL_SECONDS,
            )
          } catch {
            downloadUrl = ''
          }
          return {
            id:             r.id,
            fileName:       r.fileName,
            fileSize:       r.fileSize,
            mimeType:       r.mimeType,
            storageKey:     r.storageKey,
            thumbnailKey:   r.thumbnailKey ?? null,
            uploadedById:   r.uploadedById,
            uploadedByName: r.uploadedBy.name,
            uploadedAt:     r.createdAt.toISOString(),
            downloadUrl,
          }
        }),
      )

      return reply.send(items)
    },
  )
}

export default attachmentRoutes
