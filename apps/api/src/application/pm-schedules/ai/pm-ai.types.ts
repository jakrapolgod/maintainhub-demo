import { z } from 'zod'

// ── Re-export shared AI primitives ────────────────────────────────────────────
export {
  AI_MODEL,
  AI_MAX_TOKENS,
  AiError,
  extractText,
  parseAiJson,
  recordUsage,
  noopMonitoring,
} from '../../work-orders/ai/ai.types.js'
export type { AnthropicClient, MonitoringPort } from '../../work-orders/ai/ai.types.js'

// ── PM-specific response schema ───────────────────────────────────────────────

const pmTaskSchema = z.object({
  sequence: z.number().int().positive(),
  title: z.string().min(1),
  instructions: z.string(),
  requiresPhoto: z.boolean(),
  requiresMeterReading: z.boolean(),
  meterReadingUnit: z.string().optional(),
  estimatedMinutes: z.number().int().nonnegative(),
  isCritical: z.boolean(),
})

export const pmSuggestedScheduleSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annually']),
  interval: z.number().int().positive(),
  estimatedHours: z.number().positive(),
  advanceNoticeDays: z.number().int().nonnegative().optional(),
  tasks: z.array(pmTaskSchema).min(1),
  rationale: z.string().optional(),
})

export const pmScheduleSuggestionsSchema = z.object({
  schedules: z.array(pmSuggestedScheduleSchema).min(1).max(10),
})

export type PMSuggestedSchedule = z.infer<typeof pmSuggestedScheduleSchema>
export type PMScheduleSuggestions = z.infer<typeof pmScheduleSuggestionsSchema>
