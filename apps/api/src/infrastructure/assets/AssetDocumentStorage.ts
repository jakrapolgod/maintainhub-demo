/**
 * AssetDocumentStorage — MinIO-backed document storage for asset files.
 *
 * ## Storage layout
 *   assets/{tenantId}/{assetId}/{filename}
 *
 * ## Design decisions
 *
 * ### Key structure
 * The path prefix `assets/{tenantId}/{assetId}/` ensures:
 *   1. Tenant isolation — each tenant's files live in a separate namespace.
 *   2. Asset grouping  — all documents for an asset can be listed with a prefix scan.
 *   3. Audit-friendliness — the storage key encodes context without a DB lookup.
 *
 * ### Filename deduplication
 * A UUID prefix is prepended to the original filename so concurrent uploads of
 * identically-named files do not overwrite each other:
 *   `assets/tenant-1/asset-42/{uuid}-original-name.pdf`
 *
 * ### Presigned URLs
 * Generated with a 1-hour TTL — long enough for a user download session, short
 * enough to limit exposure if a URL leaks.  The MinIO client's `presignedGetObject`
 * handles S3-compatible HMAC signing.
 *
 * ### deleteDocument
 * Performs a hard delete of the object.  Callers must remove the corresponding
 * `Attachment` row from Prisma separately (handled in the route handler).
 */
import { randomUUID } from 'node:crypto'
import type { Client as MinioClient } from 'minio'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UploadResult {
  /** Full MinIO object key — store in `Attachment.storageKey`. */
  storageKey: string
  /** Original file name (sanitised). */
  fileName: string
  /** File size in bytes. */
  fileSize: number
  /** MIME type as provided by the caller. */
  mimeType: string
}

export interface UploadFile {
  /** Original file name (used in the key and returned in metadata). */
  filename: string
  /** File content. */
  buffer: Buffer
  /** MIME type from the multipart upload. */
  mimetype: string
}

// ── Service ───────────────────────────────────────────────────────────────────

export class AssetDocumentStorage {
  /** Presigned URL TTL in seconds (1 hour). */
  static readonly PRESIGNED_TTL_SECONDS = 3600

  private readonly minio: MinioClient

  private readonly bucket: string

  constructor(minio: MinioClient, bucket: string) {
    this.minio = minio
    this.bucket = bucket
  }

  // ── uploadDocument ─────────────────────────────────────────────────────────

  /**
   * Upload a document file for a specific asset.
   *
   * The object key follows the pattern:
   *   `assets/{tenantId}/{assetId}/{uuid}-{originalFilename}`
   *
   * @param tenantId  Tenant scoping — enforced in the key prefix.
   * @param assetId   Asset the document belongs to.
   * @param file      File content + metadata from the multipart request.
   * @returns         Metadata needed to create the `Attachment` row.
   */
  async uploadDocument(tenantId: string, assetId: string, file: UploadFile): Promise<UploadResult> {
    const safeFilename = AssetDocumentStorage.sanitiseFilename(file.filename)
    const storageKey = `assets/${tenantId}/${assetId}/${randomUUID()}-${safeFilename}`

    const metadata = {
      'Content-Type': file.mimetype,
      'x-amz-meta-tenant-id': tenantId,
      'x-amz-meta-asset-id': assetId,
    }

    await this.minio.putObject(this.bucket, storageKey, file.buffer, file.buffer.length, metadata)

    return {
      storageKey,
      fileName: safeFilename,
      fileSize: file.buffer.length,
      mimeType: file.mimetype,
    }
  }

  // ── getDocumentSignedUrl ───────────────────────────────────────────────────

  /**
   * Generate a 1-hour presigned GET URL for the given storage key.
   *
   * The URL grants temporary, unauthenticated read access — suitable for
   * serving file downloads directly from MinIO/S3 without proxying through
   * the API server.
   *
   * @param storageKey  The `Attachment.storageKey` value.
   * @returns           HTTPS presigned URL (expires in 1 hour).
   */
  async getDocumentSignedUrl(storageKey: string): Promise<string> {
    return this.minio.presignedGetObject(
      this.bucket,
      storageKey,
      AssetDocumentStorage.PRESIGNED_TTL_SECONDS,
    )
  }

  // ── deleteDocument ─────────────────────────────────────────────────────────

  /**
   * Permanently delete the object from MinIO.
   *
   * This does NOT remove the `Attachment` row from Prisma — the caller is
   * responsible for that.  Delete the DB row only after confirming the object
   * was removed to avoid orphaned metadata.
   *
   * @param storageKey  The `Attachment.storageKey` value to delete.
   */
  async deleteDocument(storageKey: string): Promise<void> {
    await this.minio.removeObject(this.bucket, storageKey)
  }

  // ── bulkDeleteDocuments ────────────────────────────────────────────────────

  /**
   * Delete multiple objects in a single MinIO request.
   * Used when an asset is decommissioned and all documents need to be purged.
   */
  async bulkDeleteDocuments(storageKeys: string[]): Promise<void> {
    if (storageKeys.length === 0) return
    await this.minio.removeObjects(this.bucket, storageKeys)
  }

  // ── getDocumentMetadata ────────────────────────────────────────────────────

  /**
   * Fetch the object's stored metadata (size, content-type, user metadata).
   * Useful for validating an upload was successful before writing the DB row.
   */
  async getDocumentMetadata(storageKey: string): Promise<{
    size: number
    contentType: string
    lastModified: Date
  }> {
    const stat = await this.minio.statObject(this.bucket, storageKey)
    return {
      size: stat.size,
      contentType: (stat.metaData['content-type'] as string) ?? 'application/octet-stream',
      lastModified: stat.lastModified,
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Remove path traversal sequences and non-ASCII characters from a filename.
   * Preserves the extension.
   */
  private static sanitiseFilename(filename: string): string {
    // Strip directory components
    const base = filename.split(/[\\/]/).pop() ?? 'file'
    // Replace anything that isn't alphanumeric, hyphen, underscore, or dot
    return base.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase()
  }
}
