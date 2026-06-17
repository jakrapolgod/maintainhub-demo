import OpenAI from 'openai'
import type {
  AnthropicClient,
  AICompletionParams,
  AIMessage,
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

export function createAiAdapter(client: OpenAI): AnthropicClient {
  return {
    chat: {
      completions: {
        async create(params: AICompletionParams): Promise<AIMessage> {
          const resp = await client.chat.completions.create({
            model: params.model,
            max_tokens: params.max_tokens ?? null,
            messages: params.messages,
          })
          const result: AIMessage = {
            choices: [
              {
                message: {
                  role: resp.choices[0]?.message?.role ?? 'assistant',
                  content: resp.choices[0]?.message?.content ?? '',
                },
              },
            ],
          }
          if (resp.usage) {
            result.usage = {
              prompt_tokens: resp.usage.prompt_tokens,
              completion_tokens: resp.usage.completion_tokens,
              total_tokens: resp.usage.total_tokens,
            }
          }
          return result
        },
      },
    },
  }
}
