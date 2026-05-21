/**
 * DraftWorkOrderFromNLUseCase
 *
 * Translates a natural-language maintenance request into a structured work-order
 * draft using Claude.  The draft is returned to the caller for user confirmation
 * — nothing is persisted until the user explicitly submits.
 *
 * ## Context enrichment
 *
 * When an assetId is supplied the use case fetches:
 *   - Asset metadata (name, type, criticality, manufacturer, model)
 *   - Last 5 completed/cancelled work orders for that asset (recent history)
 *
 * This context is embedded in the user turn so Claude can suggest appropriate
 * priority and type without the caller having to provide them.
 */
import type { PrismaClient } from '@prisma/client'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import {
  AI_MODEL,
  AI_MAX_TOKENS,
  AiError,
  draftWorkOrderSchema,
  extractText,
  parseAiJson,
  recordUsage,
  noopMonitoring,
} from './ai.types.js'
import type { AnthropicClient, DraftWorkOrderAiResponse, MonitoringPort } from './ai.types.js'

// ── Input / Output ────────────────────────────────────────────────────────────

export interface DraftWorkOrderInput {
  userMessage: string
  assetId?: string
  tenantId: string
}

export interface DraftWorkOrderDraft extends DraftWorkOrderAiResponse {
  /** The original message the user typed — preserved for the confirmation UI. */
  originalMessage: string
  /** Asset ID the draft is scoped to (may be undefined if none was provided). */
  assetId?: string
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert CMMS (Computerised Maintenance Management System) assistant specialising in industrial maintenance operations.

Your task is to convert a maintenance request message into a structured work order draft.

You MUST respond with ONLY a valid JSON object — no explanations, no markdown, no extra text.

The JSON must match this exact schema:
{
  "title": string,            // concise action-oriented title, max 100 chars
  "description": string,      // detailed description including symptoms and context, max 1000 chars
  "type": "CORRECTIVE" | "PREVENTIVE" | "INSPECTION" | "EMERGENCY",
  "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "suggestedAssignees": string[] | undefined,   // skill tags, not user IDs
  "estimatedHours": number | undefined          // positive number
}

Priority guidance:
- CRITICAL: safety hazard, production stopped, or environmental breach
- HIGH: major production impact or SLA breach imminent within 4h
- MEDIUM: partial degradation, workaround in place
- LOW: cosmetic, improvement, or planned work

Type guidance:
- CORRECTIVE: repair a broken or degraded asset
- PREVENTIVE: scheduled maintenance task
- INSPECTION: check condition without changing anything
- EMERGENCY: immediate response required (implies CRITICAL priority)`

// ── Internal types ────────────────────────────────────────────────────────────

interface AssetContext {
  asset: {
    id: string
    name: string
    criticality: string
    status: string
    manufacturer: string | null
    model: string | null
    description: string | null
    category: { name: string }
    location: { name: string } | null
  } | null
  recentWOs: Array<{
    woNumber: string
    title: string
    type: string
    priority: string
    status: string
    resolution: string | null
    completedAt: Date | null
  }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildUserContent(userMessage: string, ctx: AssetContext | null): string {
  const parts: string[] = [`Maintenance request: "${userMessage}"`]

  if (ctx?.asset) {
    const a = ctx.asset
    parts.push('\n--- Asset context ---')
    parts.push(`Asset: ${a.name} (${a.category.name})`)
    if (a.location) parts.push(`Location: ${a.location.name}`)
    if (a.manufacturer ?? a.model) {
      parts.push(`Equipment: ${[a.manufacturer, a.model].filter(Boolean).join(' ')}`)
    }
    parts.push(`Criticality: ${a.criticality} | Status: ${a.status}`)
    if (a.description) parts.push(`Description: ${a.description}`)
  }

  if (ctx && ctx.recentWOs.length > 0) {
    parts.push('\n--- Recent maintenance history (last 5) ---')
    for (const wo of ctx.recentWOs) {
      const date = wo.completedAt ? wo.completedAt.toISOString().slice(0, 10) : 'pending'
      parts.push(`[${date}] ${wo.woNumber} ${wo.type}/${wo.priority} — ${wo.title} (${wo.status})`)
      if (wo.resolution) parts.push(`  Resolution: ${wo.resolution}`)
    }
  }

  return parts.join('\n')
}

// ── Use case ──────────────────────────────────────────────────────────────────

export class DraftWorkOrderFromNLUseCase {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly ai: AnthropicClient

  private readonly monitoring: MonitoringPort

  constructor(
    db: TenantClient,
    prisma: PrismaClient,
    ai: AnthropicClient,
    monitoring: MonitoringPort = noopMonitoring,
  ) {
    this.db = db
    this.prisma = prisma
    this.ai = ai
    this.monitoring = monitoring
  }

  /**
   * @throws AiError AI_UNAVAILABLE when API key not set (test: safe to skip)
   * @throws AiError AI_API_ERROR on Anthropic API failure
   * @throws AiError AI_PARSE_ERROR / AI_VALIDATION_ERROR on bad response
   */
  async execute(input: DraftWorkOrderInput): Promise<DraftWorkOrderDraft> {
    // ── 1. Fetch asset context if provided ────────────────────────────────────
    const assetContext = input.assetId
      ? await this.fetchAssetContext(input.assetId, input.tenantId)
      : null

    // ── 2. Build user message with context ────────────────────────────────────
    const userContent = buildUserContent(input.userMessage, assetContext)

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
    recordUsage(this.monitoring, 'DraftWorkOrderFromNL', message)

    // ── 5. Parse and validate response ────────────────────────────────────────
    const raw = extractText(message)
    const draft = parseAiJson(raw, draftWorkOrderSchema)

    return {
      ...draft,
      originalMessage: input.userMessage,
      ...(input.assetId !== undefined && { assetId: input.assetId }),
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async fetchAssetContext(assetId: string, tenantId: string): Promise<AssetContext> {
    const [asset, recentWOs] = await Promise.all([
      this.db.asset.findFirst({
        where: { id: assetId, deletedAt: null },
        select: {
          id: true,
          name: true,
          criticality: true,
          status: true,
          manufacturer: true,
          model: true,
          description: true,
          category: { select: { name: true } },
          location: { select: { name: true } },
        },
      }),
      this.prisma.workOrder.findMany({
        where: {
          tenantId,
          assetId,
          status: { in: ['COMPLETED', 'CANCELLED'] },
        },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: {
          woNumber: true,
          title: true,
          type: true,
          priority: true,
          status: true,
          resolution: true,
          completedAt: true,
        },
      }),
    ])

    return { asset, recentWOs }
  }
}
