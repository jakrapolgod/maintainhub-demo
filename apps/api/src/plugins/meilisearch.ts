/**
 * Meilisearch plugin — decorates the Fastify instance with a pre-configured
 * Meilisearch client.
 *
 * The client is stateless (pure HTTP); creating one per request is wasteful.
 * This plugin creates it once at boot and makes it available as `fastify.search`.
 *
 * Configuration via env vars:
 *   MEILISEARCH_HOST  — default http://localhost:7700
 *   MEILISEARCH_KEY   — master key (optional for dev, required for prod)
 */
import { Meilisearch } from 'meilisearch'
import fp from 'fastify-plugin'
import { config } from '../config.js'

declare module 'fastify' {
  interface FastifyInstance {
    search: Meilisearch
  }
}

export default fp(
  async (fastify) => {
    const client = new Meilisearch({
      host: config.MEILISEARCH_HOST,
      apiKey: config.MEILISEARCH_KEY,
    })

    fastify.decorate('search', client)
    fastify.log.info({ host: config.MEILISEARCH_HOST }, 'Meilisearch client ready')
  },
  { name: 'meilisearch' },
)
