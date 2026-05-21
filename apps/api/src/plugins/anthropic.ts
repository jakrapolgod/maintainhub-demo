/**
 * Anthropic plugin — decorates the Fastify instance with a pre-configured
 * Anthropic API client.
 *
 * When `ANTHROPIC_API_KEY` is not set the plugin still boots successfully but
 * `fastify.anthropic` is `null`.  AI route handlers must check for null and
 * return 503 so the rest of the API keeps working without a key.
 *
 * Usage in route handlers:
 *   if (!fastify.anthropic) throw new DomainException('AI unavailable', 'AI_UNAVAILABLE', 503)
 *   const stream = fastify.anthropic.messages.stream({...})
 */
import Anthropic from '@anthropic-ai/sdk'
import fp from 'fastify-plugin'
import { config } from '../config.js'

declare module 'fastify' {
  interface FastifyInstance {
    /** Anthropic API client, or null when ANTHROPIC_API_KEY is not configured. */
    anthropic: Anthropic | null
  }
}

export default fp(
  async (fastify) => {
    const client = config.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })
      : null

    if (!client) {
      fastify.log.warn('ANTHROPIC_API_KEY not set — AI routes will return 503')
    }

    fastify.decorate('anthropic', client)
  },
  { name: 'anthropic', dependencies: [] },
)
