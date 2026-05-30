/**
 * OpenRouter plugin — decorates the Fastify instance with a pre-configured
 * OpenAI-compatible client pointed at OpenRouter.
 *
 * When `OPENROUTER_API_KEY` is not set the plugin still boots successfully but
 * `fastify.openrouter` is `null`.  AI route handlers must check for null and
 * return 503 so the rest of the API keeps working without a key.
 *
 * Usage in route handlers:
 *   if (!fastify.openrouter) throw new DomainException('AI unavailable', 'AI_UNAVAILABLE', 503)
 *   const stream = await fastify.openrouter.chat.completions.create({..., stream: true})
 */
import OpenAI from 'openai'
import fp from 'fastify-plugin'
import { config } from '../config.js'

declare module 'fastify' {
  interface FastifyInstance {
    /** OpenRouter AI client, or null when OPENROUTER_API_KEY is not configured. */
    openrouter: OpenAI | null
  }
}

export default fp(
  async (fastify) => {
    const client = config.OPENROUTER_API_KEY
      ? new OpenAI({
          baseURL: 'https://openrouter.ai/api/v1',
          apiKey: config.OPENROUTER_API_KEY,
          defaultHeaders: {
            'HTTP-Referer': 'https://maintainai.vercel.app',
            'X-Title': 'MaintainHub',
          },
        })
      : null

    if (!client) {
      fastify.log.warn('OPENROUTER_API_KEY not set — AI routes will return 503')
    }

    fastify.decorate('openrouter', client)
  },
  { name: 'openrouter', dependencies: [] },
)
