/**
 * GeneratePMScheduleFromAssetType
 *
 * Uses Claude to suggest a set of preventive maintenance schedules for a given
 * asset type.  The user reviews the suggestions and activates the ones they want.
 *
 * ## Prompt design
 *
 * The system prompt instructs Claude to:
 *   1. Apply ISO 55000 / ISO 14224 best practices
 *   2. Return a strict JSON structure (validated with Zod)
 *   3. Cover multiple maintenance horizons (daily, weekly, monthly, annually)
 *   4. Include specific task instructions a technician can follow
 *
 * ## Error handling
 *   - AiError(AI_UNAVAILABLE)  when ANTHROPIC_API_KEY is not configured
 *   - AiError(AI_API_ERROR)    on Anthropic API failure
 *   - AiError(AI_PARSE_ERROR)  on non-JSON response
 *   - AiError(AI_VALIDATION_ERROR) when JSON doesn't match schema
 */
import {
  AI_MODEL,
  AI_MAX_TOKENS,
  AiError,
  extractText,
  parseAiJson,
  recordUsage,
  noopMonitoring,
  pmScheduleSuggestionsSchema,
} from './pm-ai.types.js'
import type { AnthropicClient, MonitoringPort, PMScheduleSuggestions } from './pm-ai.types.js'

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a certified maintenance reliability engineer (CMRP) with expertise in ISO 55000 asset management, ISO 14224 failure taxonomy, and industry-specific preventive maintenance (PM) programs.

When given an asset type (and optionally manufacturer/model), generate a comprehensive set of preventive maintenance schedules following reliability-centered maintenance (RCM) principles.

Guidelines:
- Cover multiple maintenance horizons: e.g. weekly, monthly, quarterly, annually
- Each schedule should focus on a coherent maintenance activity (lubrication, inspection, calibration, etc.)
- Task instructions must be actionable and specific enough for a qualified technician
- Mark isCritical=true for tasks involving safety-critical components
- Mark requiresPhoto=true where visual documentation is important
- Use international units (hours, minutes, metric)
- Base recommendations on manufacturer best practices and ISO standards where applicable

You MUST respond with ONLY a valid JSON object — no explanations, no markdown fences, no extra text.

JSON schema:
{
  "schedules": [
    {
      "title": string,
      "description": string,
      "frequency": "daily"|"weekly"|"monthly"|"quarterly"|"annually",
      "interval": number (positive integer, e.g. 1 = every 1 month),
      "estimatedHours": number (decimal, e.g. 2.5),
      "advanceNoticeDays": number (default 7),
      "rationale": string (why this schedule, what failure modes it prevents),
      "tasks": [
        {
          "sequence": number,
          "title": string,
          "instructions": string,
          "requiresPhoto": boolean,
          "requiresMeterReading": boolean,
          "meterReadingUnit": string | undefined,
          "estimatedMinutes": number,
          "isCritical": boolean
        }
      ]
    }
  ]
}

Return 2–5 schedules that together form a complete PM program for the asset.`

// ── Input / Output ────────────────────────────────────────────────────────────

export interface GeneratePMScheduleInput {
  assetType: string
  manufacturer?: string
  model?: string
}

export type GeneratePMScheduleResult = PMScheduleSuggestions

// ── Use case ──────────────────────────────────────────────────────────────────

export class GeneratePMScheduleFromAssetType {
  constructor(
    private readonly ai: AnthropicClient,
    private readonly monitoring: MonitoringPort = noopMonitoring,
  ) {}

  /**
   * @throws AiError when input is blank, API fails, or response is invalid
   */
  async execute(input: GeneratePMScheduleInput): Promise<GeneratePMScheduleResult> {
    if (!input.assetType || input.assetType.trim().length === 0) {
      throw new AiError('assetType must not be empty', 'AI_API_ERROR', 422)
    }

    const userContent = GeneratePMScheduleFromAssetType.buildUserContent(input)

    // ── Call Claude ───────────────────────────────────────────────────────────
    let message
    try {
      message = await this.ai.messages.create({
        model: AI_MODEL,
        max_tokens: AI_MAX_TOKENS * 4, // PM schedules need more tokens than WO drafts
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      })
    } catch (err) {
      throw new AiError(
        `Anthropic API error: ${err instanceof Error ? err.message : String(err)}`,
        'AI_API_ERROR',
      )
    }

    // ── Record token usage ────────────────────────────────────────────────────
    recordUsage(this.monitoring, 'GeneratePMSchedule', message)

    // ── Parse and validate ────────────────────────────────────────────────────
    const raw = extractText(message)
    return parseAiJson(raw, pmScheduleSuggestionsSchema)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static buildUserContent(input: GeneratePMScheduleInput): string {
    const parts: string[] = []
    parts.push(`Asset type: ${input.assetType}`)
    if (input.manufacturer) parts.push(`Manufacturer: ${input.manufacturer}`)
    if (input.model) parts.push(`Model: ${input.model}`)
    parts.push('')
    parts.push('Generate a complete preventive maintenance program for this asset type.')
    return parts.join('\n')
  }
}
