/**
 * Shared types and utilities for AI work-order use cases.
 *
 * ## Design decisions
 *
 * • `AnthropicClient` is a thin interface over the real Anthropic SDK so tests
 *   can inject a mock without importing the SDK.  Only the subset of the SDK
 *   surface actually used is declared here.
 *
 * • Token usage is emitted to a `MonitoringPort` rather than a logger so the
 *   call site can choose whether to write to Pino, a metrics sink, or a stub
 *   in tests.  The interface is intentionally minimal — add fields as needed.
 *
 * • `AiError` wraps both Anthropic API errors and JSON parse / Zod validation
 *   failures with a typed `code` so the route layer can map them to HTTP status
 *   codes without inspecting error messages.
 */
import { z } from 'zod'

// ── Model constant ────────────────────────────────────────────────────────────

export const AI_MODEL = 'anthropic/claude-sonnet-4-5'
export const AI_MAX_TOKENS = 1024

// ── Anthropic client interface (injectable / mockable) ────────────────────────

export interface AnthropicMessage {
  content: Array<{ type: string; text?: string }>
  usage: { input_tokens: number; output_tokens: number }
}

export interface AnthropicMessagesCreate {
  model: string
  max_tokens: number
  system: string
  messages: Array<{ role: 'user'; content: string }>
}

/**
 * Minimal slice of the Anthropic SDK surface used by these use cases.
 * The real `Anthropic` client satisfies this interface at runtime.
 */
export interface AnthropicClient {
  messages: {
    create(params: AnthropicMessagesCreate): Promise<AnthropicMessage>
  }
}

// ── Monitoring port ───────────────────────────────────────────────────────────

export interface TokenUsage {
  useCase: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/**
 * Called after every successful AI response so callers can forward token
 * usage to Pino, Prometheus, Datadog, etc.  Must not throw.
 */
export interface MonitoringPort {
  recordTokenUsage(usage: TokenUsage): void
}

/** Default no-op monitoring port — used when caller does not provide one. */
export const noopMonitoring: MonitoringPort = {
  recordTokenUsage: () => {
    /* intentional no-op */
  },
}

// ── AI error ──────────────────────────────────────────────────────────────────

export type AiErrorCode =
  | 'AI_API_ERROR' // Anthropic API returned an error
  | 'AI_PARSE_ERROR' // Response was not valid JSON
  | 'AI_VALIDATION_ERROR' // JSON did not match expected schema
  | 'AI_UNAVAILABLE' // ANTHROPIC_API_KEY not configured

export class AiError extends Error {
  readonly code: AiErrorCode

  readonly statusCode: number

  constructor(message: string, code: AiErrorCode, statusCode = 502) {
    super(message)
    this.name = 'AiError'
    this.code = code
    this.statusCode = statusCode
  }
}

// ── Shared Zod schemas ────────────────────────────────────────────────────────

export const draftWorkOrderSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  type: z.enum(['CORRECTIVE', 'PREVENTIVE', 'INSPECTION', 'EMERGENCY']),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  suggestedAssignees: z.array(z.string()).optional(),
  estimatedHours: z.number().positive().optional(),
})

export const failureAnalysisSchema = z.object({
  probableCauses: z.array(z.string()).min(1),
  recommendedActions: z.array(z.string()).min(1),
  suggestedParts: z.array(z.string()),
  urgency: z.enum(['IMMEDIATE', 'URGENT', 'ROUTINE', 'MONITOR']),
})

export type DraftWorkOrderAiResponse = z.infer<typeof draftWorkOrderSchema>
export type FailureAnalysisAiResponse = z.infer<typeof failureAnalysisSchema>

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the text content from an Anthropic message response.
 * Throws `AiError` if no text block is present.
 */
export function extractText(message: AnthropicMessage): string {
  for (const block of message.content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      return block.text
    }
  }
  throw new AiError('AI response contained no text content', 'AI_PARSE_ERROR')
}

/**
 * Parse the raw AI text as JSON, then validate with a Zod schema.
 * Strips markdown code fences (```json … ```) that Claude sometimes adds.
 */
export function parseAiJson<T>(raw: string, schema: z.ZodType<T>): T {
  // Strip optional markdown code fences
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    throw new AiError(`AI response was not valid JSON: ${stripped.slice(0, 200)}`, 'AI_PARSE_ERROR')
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new AiError(
      `AI response failed validation: ${result.error.message}`,
      'AI_VALIDATION_ERROR',
    )
  }
  return result.data
}

/**
 * Record token usage from a completed AI response.
 * Never throws — monitoring is always non-fatal.
 */
export function recordUsage(
  monitoring: MonitoringPort,
  useCase: string,
  message: AnthropicMessage,
): void {
  try {
    monitoring.recordTokenUsage({
      useCase,
      model: AI_MODEL,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      totalTokens: message.usage.input_tokens + message.usage.output_tokens,
    })
  } catch {
    // Monitoring failures are non-fatal
  }
}
