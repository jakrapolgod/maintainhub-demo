import { DraftWorkOrderFromNLUseCase } from '../draft-work-order-from-nl'
import type { DraftWorkOrderInput } from '../draft-work-order-from-nl'

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT = 'tenant-1'
const ASSET = 'asset-1'

const VALID_DRAFT = {
  title: 'Replace mechanical seal on Pump P-101',
  description: 'Pump P-101 is leaking from the shaft seal area. Seal replacement required.',
  type: 'CORRECTIVE',
  priority: 'HIGH',
  suggestedAssignees: ['mechanical-technician'],
  estimatedHours: 4,
}

function makeAiResponse(body: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(body) }],
    usage: { input_tokens: 150, output_tokens: 80 },
  }
}

function makeDeps(
  opts: {
    aiResponse?: unknown
    assetRow?: unknown
    woRows?: unknown[]
  } = {},
) {
  const {
    aiResponse = VALID_DRAFT,
    assetRow = {
      id: ASSET,
      name: 'Pump P-101',
      criticality: 'B',
      status: 'OPERATIONAL',
      manufacturer: 'Grundfos',
      model: 'CR 5-8',
      description: null,
      category: { name: 'Rotating Equipment' },
      location: { name: 'Building A — Level 1' },
    },
    woRows = [
      {
        woNumber: 'WO-001',
        title: 'Seal replacement',
        type: 'CORRECTIVE',
        priority: 'HIGH',
        status: 'COMPLETED',
        resolution: 'Replaced seal',
        completedAt: new Date('2024-01-15'),
      },
    ],
  } = opts

  const db = {
    asset: {
      findFirst: jest.fn().mockResolvedValue(assetRow),
    },
  }

  const prisma = {
    workOrder: {
      findMany: jest.fn().mockResolvedValue(woRows),
    },
  }

  const ai = {
    messages: {
      create: jest.fn().mockResolvedValue(makeAiResponse(aiResponse)),
    },
  }

  const monitoring = { recordTokenUsage: jest.fn() }

  return { db, prisma, ai, monitoring }
}

const BASE_INPUT: DraftWorkOrderInput = {
  userMessage: 'Pump P-101 is leaking badly',
  tenantId: TENANT,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DraftWorkOrderFromNLUseCase', () => {
  it('returns a draft with the AI-generated fields', async () => {
    const { db, prisma, ai, monitoring } = makeDeps()
    const uc = new DraftWorkOrderFromNLUseCase(db as never, prisma as never, ai, monitoring)

    const draft = await uc.execute(BASE_INPUT)

    expect(draft.title).toBe(VALID_DRAFT.title)
    expect(draft.type).toBe('CORRECTIVE')
    expect(draft.priority).toBe('HIGH')
  })

  it('preserves originalMessage in the draft', async () => {
    const { db, prisma, ai, monitoring } = makeDeps()
    const uc = new DraftWorkOrderFromNLUseCase(db as never, prisma as never, ai, monitoring)

    const draft = await uc.execute(BASE_INPUT)

    expect(draft.originalMessage).toBe(BASE_INPUT.userMessage)
  })

  it('fetches asset context and includes assetId in draft when provided', async () => {
    const { db, prisma, ai, monitoring } = makeDeps()
    const uc = new DraftWorkOrderFromNLUseCase(db as never, prisma as never, ai, monitoring)

    const draft = await uc.execute({ ...BASE_INPUT, assetId: ASSET })

    expect(db.asset.findFirst).toHaveBeenCalledTimes(1)
    expect(draft.assetId).toBe(ASSET)
  })

  it('does NOT fetch asset when no assetId provided', async () => {
    const { db, prisma, ai, monitoring } = makeDeps()
    const uc = new DraftWorkOrderFromNLUseCase(db as never, prisma as never, ai, monitoring)

    await uc.execute(BASE_INPUT)

    expect(db.asset.findFirst).not.toHaveBeenCalled()
    expect(prisma.workOrder.findMany).not.toHaveBeenCalled()
  })

  it('calls AI with a user message containing the maintenance request', async () => {
    const { db, prisma, ai, monitoring } = makeDeps()
    const uc = new DraftWorkOrderFromNLUseCase(db as never, prisma as never, ai, monitoring)

    await uc.execute(BASE_INPUT)

    const call = (ai.messages.create as jest.Mock).mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>
    }
    expect(call.messages[0]?.content).toContain('Pump P-101 is leaking badly')
  })

  it('includes asset context in the user message when assetId provided', async () => {
    const { db, prisma, ai, monitoring } = makeDeps()
    const uc = new DraftWorkOrderFromNLUseCase(db as never, prisma as never, ai, monitoring)

    await uc.execute({ ...BASE_INPUT, assetId: ASSET })

    const call = (ai.messages.create as jest.Mock).mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>
    }
    const content = call.messages[0]?.content ?? ''
    expect(content).toContain('Pump P-101')
    expect(content).toContain('Grundfos CR 5-8')
    expect(content).toContain('Building A')
  })

  it('includes maintenance history in the user message', async () => {
    const { db, prisma, ai, monitoring } = makeDeps()
    const uc = new DraftWorkOrderFromNLUseCase(db as never, prisma as never, ai, monitoring)

    await uc.execute({ ...BASE_INPUT, assetId: ASSET })

    const call = (ai.messages.create as jest.Mock).mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>
    }
    expect(call.messages[0]?.content).toContain('WO-001')
  })

  it('records token usage via monitoring', async () => {
    const { db, prisma, ai, monitoring } = makeDeps()
    const uc = new DraftWorkOrderFromNLUseCase(db as never, prisma as never, ai, monitoring)

    await uc.execute(BASE_INPUT)

    expect(monitoring.recordTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        useCase: 'DraftWorkOrderFromNL',
        inputTokens: 150,
        outputTokens: 80,
        totalTokens: 230,
      }),
    )
  })

  it('wraps Anthropic API errors in AiError AI_API_ERROR', async () => {
    const { db, prisma, monitoring } = makeDeps()
    const failingAi = {
      messages: { create: jest.fn().mockRejectedValue(new Error('rate limited')) },
    }
    const uc = new DraftWorkOrderFromNLUseCase(db as never, prisma as never, failingAi, monitoring)

    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({ code: 'AI_API_ERROR' })
  })

  it('throws AI_VALIDATION_ERROR when AI returns wrong schema', async () => {
    const { db, prisma, monitoring } = makeDeps()
    const badAi = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: '{"unexpected":"field"}' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      },
    }
    const uc = new DraftWorkOrderFromNLUseCase(db as never, prisma as never, badAi, monitoring)

    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({ code: 'AI_VALIDATION_ERROR' })
  })

  it('handles markdown-fenced JSON from the AI', async () => {
    const fenced = `\`\`\`json\n${JSON.stringify(VALID_DRAFT)}\n\`\`\``
    const { db, prisma, monitoring } = makeDeps()
    const fencedAi = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: fenced }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      },
    }
    const uc = new DraftWorkOrderFromNLUseCase(db as never, prisma as never, fencedAi, monitoring)

    const draft = await uc.execute(BASE_INPUT)
    expect(draft.title).toBe(VALID_DRAFT.title)
  })

  it('works without estimatedHours or suggestedAssignees (optional fields)', async () => {
    const minimal = { title: 'T', description: 'D', type: 'INSPECTION', priority: 'LOW' }
    const { db, prisma, monitoring } = makeDeps({ aiResponse: minimal })
    const minimalAi = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify(minimal) }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      },
    }
    const uc = new DraftWorkOrderFromNLUseCase(db as never, prisma as never, minimalAi, monitoring)

    const draft = await uc.execute(BASE_INPUT)
    expect(draft.estimatedHours).toBeUndefined()
    expect(draft.suggestedAssignees).toBeUndefined()
  })
})
