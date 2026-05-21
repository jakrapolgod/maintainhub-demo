/**
 * MinIO plugin — decorates the Fastify instance with a pre-configured S3
 * client and the default bucket name.
 *
 * Usage in route handlers:
 *   await fastify.minio.putObject(fastify.minioBucket, key, stream, size, meta)
 *   const url = await fastify.minio.presignedGetObject(fastify.minioBucket, key, ttl)
 */
import { Client } from 'minio'
import fp from 'fastify-plugin'
import { config } from '../config.js'

declare module 'fastify' {
  interface FastifyInstance {
    /** Pre-configured MinIO / S3 client. */
    minio: Client
    /** Default bucket name for all application objects. */
    minioBucket: string
  }
}

export default fp(
  async (fastify) => {
    const client = new Client({
      endPoint: config.MINIO_ENDPOINT,
      port: config.MINIO_PORT,
      useSSL: config.MINIO_USE_SSL,
      accessKey: config.MINIO_ACCESS_KEY,
      secretKey: config.MINIO_SECRET_KEY,
    })

    // Ensure the bucket exists on startup (idempotent; safe to call every boot)
    try {
      const exists = await client.bucketExists(config.MINIO_BUCKET_NAME)
      if (!exists) {
        await client.makeBucket(config.MINIO_BUCKET_NAME)
        fastify.log.info({ bucket: config.MINIO_BUCKET_NAME }, 'MinIO bucket created')
      } else {
        fastify.log.info({ bucket: config.MINIO_BUCKET_NAME }, 'MinIO bucket ready')
      }
    } catch (err) {
      // Non-fatal on startup — attachments will fail at request time if MinIO is down,
      // but the API server should still boot.
      fastify.log.warn({ err }, 'MinIO bucket check failed — upload routes may be unavailable')
    }

    fastify.decorate('minio', client)
    fastify.decorate('minioBucket', config.MINIO_BUCKET_NAME)
  },
  { name: 'minio' },
)
