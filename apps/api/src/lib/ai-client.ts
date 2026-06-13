/**
 * OpenRouter AI client for the MaintainHub API.
 *
 * Uses the OpenAI-compatible API exposed by openrouter.ai so any model
 * available there can be swapped in via OPENROUTER_MODEL without code changes.
 *
 * `createAiAdapter` wraps the raw OpenAI client and satisfies the
 * `AnthropicClient` interface consumed by the use cases, keeping those files
 * unchanged despite the underlying provider swap.
 */
import OpenAI from 'openai'
import type {
  AnthropicClient,
  AnthropicMessage,
  AnthropicMessagesCreate,
} from '../application/work-orders/ai/ai.types.js'

// ── Client factory ────────────────────────────────────────────────────────────

export function createOpenRouterClient(opts: {
  apiKey: string
  baseURL: string
  appUrl: string
}): OpenAI {
  return new OpenAI({
    baseURL: opts.baseURL,
    apiKey: opts.apiKey,
    defaultHeaders: {
      'HTTP-Referer': opts.appUrl,
      'X-Title': 'MaintainHub',
    },
  })
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * Wraps a raw OpenAI / OpenRouter client so it satisfies the `AnthropicClient`
 * interface used by all AI use cases.  Translates:
 *   - Anthropic `{ system, messages }` → OpenAI `{ messages: [{role:'system'}, ...] }`
 *   - OpenAI   `{ choices[0].message.content, usage.prompt_tokens }` → Anthropic response shape
 */
export function createAiAdapter(client: OpenAI): AnthropicClient {
  return {
    messages: {
      async create(params: AnthropicMessagesCreate): Promise<AnthropicMessage> {
        const resp = await client.chat.completions.create({
          model: params.model,
          max_tokens: params.max_tokens,
          messages: [{ role: 'system', content: params.system }, ...params.messages],
        })
        return {
          content: [{ type: 'text', text: resp.choices[0]?.message?.content ?? '' }],
          usage: {
            input_tokens: resp.usage?.prompt_tokens ?? 0,
            output_tokens: resp.usage?.completion_tokens ?? 0,
          },
        }
      },
    },
  }
}
