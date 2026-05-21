/**
 * AnalyzeFailureUseCase
 *
 * Given a work order and a symptom description, asks Claude to perform a
 * structured root-cause analysis informed by the asset's full maintenance
 * history.
 *
 * ## Context provided to Claude
 *
 *   - Work order details (type, priority, description, current status)
 *   - Asset metadata (name, category, criticality, manufacturer/model)
 *   - Last 20 work orders for this asset (sorted newest first) — titles,
 *     types, resolutions, and failure codes give Claude a maintenance timeline
 *
 * ## Output
 *
 *   - probableCauses:     ranked list of likely root causes
 *   - recommendedActions: ordered action steps
 *   - suggestedParts:     generic part descriptions (not part IDs)
 *   - urgency:            IMMEDIATE | URGENT | ROUTINE | MONITOR
 */
import type { PrismaClient } from '@prisma/client'
import {
  AI_MODEL,
  AI_MAX_TOKENS,
  AiError,
  failureAnalysisSchema,
  extractText,
  parseAiJson,
  recordUsage,
  noopMonitoring,
} from './ai.types.js'
import type { AnthropicClient, FailureAnalysisAiResponse, MonitoringPort } from './ai.types.js'
import { DomainException } from '../../../errors/domain.exception.js'

// ── Input / Output ────────────────────────────────────────────────────────────

export interface AnalyzeFailureInput {
  workOrderId: string
  symptomDescription: string
  tenantId: string
}

export type FailureAnalysisResult = FailureAnalysisAiResponse

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert maintenance engineer and reliability specialist with deep knowledge of industrial asset failure modes, root cause analysis (RCA), and FMEA (Failure Mode and Effects Analysis).

Analyse the provided symptom description and asset maintenance history to identify probable failure causes and recommended corrective actions.

You MUST respond with ONLY a valid JSON object — no explanations, no markdown, no extra text.

The JSON must match this exact schema:
{
  "probableCauses": string[],       // 1–5 most likely root causes, ranked by probability (most probable first)
  "recommendedActions": string[],   // ordered action steps; first step should be the most urgent
  "suggestedParts": string[],       // generic part descriptions (e.g. "mechanical seal", "bearing 6205-2RS")
  "urgency": "IMMEDIATE" | "URGENT" | "ROUTINE" | "MONITOR"
}

Urgency definitions:
- IMMEDIATE: imminent safety risk or total production stoppage — act within 1 hour
- URGENT: significant production or safety impact — act within 4–8 hours
- ROUTINE: can be scheduled in next maintenance window (24–72 hours)
- MONITOR: condition to watch; no immediate action required

Be specific and technical. Reference relevant failure modes (ISO 14224 where applicable).`

// ── Internal types ────────────────────────────────────────────────────────────

type WoWithAsset = {
  woNumber: string
  title: string
  description: string | null
  type: string
  priority: string
  status: string
  asset: {
    name: string
    criticality: string
    manufacturer: string | null
    model: string | null
    description: string | null
    category: { name: string }
    location: { name: string } | null
  }
  failureCode: { code: string; name: string; category: string } | null
}

type HistoryRow = {
  woNumber: string
  title: string
  type: string
  priority: string
  status: string
  resolution: string | null
  completedAt: Date | null
  failureCode: { code: string; name: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildUserContent(wo: WoWithAsset, history: HistoryRow[], symptom: string): string {
  const a = wo.asset
  const parts: string[] = []

  parts.push(`Symptom description: "${symptom}"`)
  parts.push('\n--- Current work order ---')
  parts.push(
    `WO: ${wo.woNumber} | Type: ${wo.type} | Priority: ${wo.priority} | Status: ${wo.status}`,
  )
  parts.push(`Title: ${wo.title}`)
  if (wo.description) parts.push(`Description: ${wo.description}`)
  if (wo.failureCode)
    parts.push(
      `Failure code: ${wo.failureCode.code} — ${wo.failureCode.name} (${wo.failureCode.category})`,
    )

  parts.push('\n--- Asset information ---')
  parts.push(`Asset: ${a.name} (${a.category.name})`)
  if (a.location) parts.push(`Location: ${a.location.name}`)
  if (a.manufacturer ?? a.model) {
    parts.push(`Equipment: ${[a.manufacturer, a.model].filter(Boolean).join(' ')}`)
  }
  parts.push(`Criticality: ${a.criticality}`)
  if (a.description) parts.push(`Asset notes: ${a.description}`)

  if (history.length > 0) {
    parts.push('\n--- Maintenance history (last 20 WOs on this asset) ---')
    for (const h of history) {
      const date = h.completedAt ? h.completedAt.toISOString().slice(0, 10) : 'open'
      const fc = h.failureCode ? ` [${h.failureCode.code}]` : ''
      parts.push(`[${date}] ${h.woNumber} ${h.type}/${h.priority}${fc} — ${h.title} (${h.status})`)
      if (h.resolution) parts.push(`  Resolution: ${h.resolution}`)
    }
  } else {
    parts.push('\n--- Maintenance history: none recorded ---')
  }

  return parts.join('\n')
}

// ── Use case ──────────────────────────────────────────────────────────────────

export class AnalyzeFailureUseCase {
  private readonly prisma: PrismaClient

  private readonly ai: AnthropicClient

  private readonly monitoring: MonitoringPort

  constructor(
    prisma: PrismaClient,
    ai: AnthropicClient,
    monitoring: MonitoringPort = noopMonitoring,
  ) {
    this.prisma = prisma
    this.ai = ai
    this.monitoring = monitoring
  }

  /**
   * @throws DomainException NOT_FOUND when work order does not exist
   * @throws AiError AI_API_ERROR on Anthropic API failure
   * @throws AiError AI_PARSE_ERROR / AI_VALIDATION_ERROR on bad response
   */
  async execute(input: AnalyzeFailureInput): Promise<FailureAnalysisResult> {
    // ── 1. Load work order + asset + history ──────────────────────────────────
    const wo = await this.prisma.workOrder.findFirst({
      where: {
        id: input.workOrderId,
        tenantId: input.tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        woNumber: true,
        title: true,
        description: true,
        type: true,
        priority: true,
        status: true,
        assetId: true,
        asset: {
          select: {
            name: true,
            criticality: true,
            manufacturer: true,
            model: true,
            description: true,
            category: { select: { name: true } },
            location: { select: { name: true } },
          },
        },
        failureCode: { select: { code: true, name: true, category: true } },
      },
    })

    if (!wo) {
      throw new DomainException('Work order not found', 'NOT_FOUND', 404)
    }

    const history = await this.prisma.workOrder.findMany({
      where: {
        tenantId: input.tenantId,
        assetId: wo.assetId,
        id: { not: input.workOrderId },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        woNumber: true,
        title: true,
        type: true,
        priority: true,
        status: true,
        resolution: true,
        completedAt: true,
        failureCode: { select: { code: true, name: true } },
      },
    })

    // ── 2. Build prompt ───────────────────────────────────────────────────────
    const userContent = buildUserContent(wo, history, input.symptomDescription)

    // ── 3. Call Claude ────────────────────────────────────────────────────────
    let message
    try {
      message = await this.ai.messages.create({
        model: AI_MODEL,
        max_tokens: AI_MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      })
    } catch (err) {
      throw new AiError(
        `Anthropic API error: ${err instanceof Error ? err.message : String(err)}`,
        'AI_API_ERROR',
      )
    }

    // ── 4. Record token usage ─────────────────────────────────────────────────
    recordUsage(this.monitoring, 'AnalyzeFailure', message)

    // ── 5. Parse and validate ─────────────────────────────────────────────────
    const raw = extractText(message)
    return parseAiJson(raw, failureAnalysisSchema)
  }
}
