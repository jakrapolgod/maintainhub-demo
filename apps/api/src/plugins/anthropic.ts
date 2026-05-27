/**
 * AI plugin — decorates the Fastify instance with a pre-configured
 * OpenRouter client (OpenAI-compatible API).
 *
 * When `OPENROUTER_API_KEY` is not set the plugin still boots successfully but
 * `fastify.ai` is `null`.  AI route handlers must check for null and return
 * 503 so the rest of the API keeps working without a key.
 *
 * Usage in route handlers:
 *   if (!fastify.ai) throw new DomainException('AI unavailable', 'AI_UNAVAILABLE', 503)
 *   const stream = fastify.ai.chat.completions.create({ stream: true, ... })
 */
import type OpenAI from 'openai'
import fp from 'fastify-plugin'
import { config } from '../config.js'
import { createOpenRouterClient } from '../lib/ai-client.js'

declare module 'fastify' {
  interface FastifyInstance {
    /** OpenRouter client (OpenAI-compatible), or null when OPENROUTER_API_KEY is not configured. */
    ai: OpenAI | null
  }
}

export default fp(
  async (fastify) => {
    const client = config.OPENROUTER_API_KEY
      ? createOpenRouterClient({
          apiKey: config.OPENROUTER_API_KEY,
          baseURL: config.OPENROUTER_BASE_URL,
          appUrl: config.APP_URL,
        })
      : null

    if (!client) {
      fastify.log.warn('OPENROUTER_API_KEY not set — AI routes will return 503')
    }

    fastify.decorate('ai', client)
  },
  { name: 'anthropic', dependencies: [] },
)
