import { AnalyzeFailureUseCase } from '../analyze-failure'
import type { AnalyzeFailureInput } from '../analyze-failure'

// ── Helpers ───────────────────────────────────────────────────────────────────

const WO_ID = 'wo-1'
const TENANT = 'tenant-1'

const VALID_ANALYSIS = {
  probableCauses: ['Worn mechanical seal', 'Bearing failure'],
  recommendedActions: ['Isolate pump', 'Inspect seal and bearing', 'Replace worn components'],
  suggestedParts: ['Mechanical seal kit', 'Deep groove ball bearing 6205-2RS'],
  urgency: 'URGENT',
}

function makeWoRow(overrides = {}) {
  return {
    id: WO_ID,
    woNumber: 'WO-2024-000001',
    title: 'Pump leaking',
    description: 'Oil leak from shaft',
    type: 'CORRECTIVE',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    assetId: 'asset-1',
    asset: {
      name: 'Pump P-101',
      criticality: 'B',
      manufacturer: 'Grundfos',
      model: 'CR 5-8',
      description: null,
      category: { name: 'Rotating Equipment' },
      location: { name: 'Building A' },
    },
    failureCode: null,
    ...overrides,
  }
}

function makeHistoryRow() {
  return {
    woNumber: 'WO-023',
    title: 'Previous seal leak',
    type: 'CORRECTIVE',
    priority: 'MEDIUM',
    status: 'COMPLETED',
    resolution: 'Replaced lip seal',
    completedAt: new Date('2024-02-01'),
    failureCode: null,
  }
}

function makeDeps(
  opts: {
    woRow?: ReturnType<typeof makeWoRow> | null
    history?: ReturnType<typeof makeHistoryRow>[]
    aiResponse?: unknown
  } = {},
) {
  const { woRow = makeWoRow(), history = [makeHistoryRow()], aiResponse = VALID_ANALYSIS } = opts

  const prisma = {
    workOrder: {
      findFirst: jest.fn().mockResolvedValue(woRow),
      findMany: jest.fn().mockResolvedValue(history),
    },
  }

  const ai = {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { role: 'assistant', content: JSON.stringify(aiResponse) } }],
          usage: { prompt_tokens: 200, completion_tokens: 100 },
        }),
      },
    },
  }

  const monitoring = { recordTokenUsage: jest.fn() }

  return { prisma, ai, monitoring }
}

const BASE_INPUT: AnalyzeFailureInput = {
  workOrderId: WO_ID,
  symptomDescription: 'Oil leaking from shaft area, getting worse',
  tenantId: TENANT,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AnalyzeFailureUseCase', () => {
  it('returns probableCauses, recommendedActions, suggestedParts, urgency', async () => {
    const { prisma, ai, monitoring } = makeDeps()
    const uc = new AnalyzeFailureUseCase(prisma as never, ai, monitoring)

    const result = await uc.execute(BASE_INPUT)

    expect(result.probableCauses).toEqual(VALID_ANALYSIS.probableCauses)
    expect(result.recommendedActions).toHaveLength(3)
    expect(result.suggestedParts).toHaveLength(2)
    expect(result.urgency).toBe('URGENT')
  })

  it('throws NOT_FOUND when work order does not exist', async () => {
    const { prisma, ai, monitoring } = makeDeps({ woRow: null })
    const uc = new AnalyzeFailureUseCase(prisma as never, ai, monitoring)

    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('includes symptom and WO title in the AI user message', async () => {
    const { prisma, ai, monitoring } = makeDeps()
    const uc = new AnalyzeFailureUseCase(prisma as never, ai, monitoring)

    await uc.execute(BASE_INPUT)

    const call = (ai.chat.completions.create as jest.Mock).mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>
    }
    // messages[0] = system prompt, messages[1] = user content
    const content = call.messages[1]?.content ?? ''
    expect(content).toContain('Oil leaking from shaft area')
    expect(content).toContain('Pump leaking')
  })

  it('includes maintenance history in the AI message', async () => {
    const { prisma, ai, monitoring } = makeDeps()
    const uc = new AnalyzeFailureUseCase(prisma as never, ai, monitoring)

    await uc.execute(BASE_INPUT)

    const call = (ai.chat.completions.create as jest.Mock).mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>
    }
    expect(call.messages[1]?.content).toContain('WO-023')
    expect(call.messages[1]?.content).toContain('Replaced lip seal')
  })

  it('includes "no history" note when asset has no prior WOs', async () => {
    const { prisma, ai, monitoring } = makeDeps({ history: [] })
    const uc = new AnalyzeFailureUseCase(prisma as never, ai, monitoring)

    await uc.execute(BASE_INPUT)

    const call = (ai.chat.completions.create as jest.Mock).mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>
    }
    expect(call.messages[1]?.content).toContain('none recorded')
  })

  it('records token usage', async () => {
    const { prisma, ai, monitoring } = makeDeps()
    const uc = new AnalyzeFailureUseCase(prisma as never, ai, monitoring)

    await uc.execute(BASE_INPUT)

    expect(monitoring.recordTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({ useCase: 'AnalyzeFailure', totalTokens: 300 }),
    )
  })

  it('wraps API errors in AI_API_ERROR', async () => {
    const { prisma, monitoring } = makeDeps()
    const badAi = {
      chat: { completions: { create: jest.fn().mockRejectedValue(new Error('overloaded')) } },
    }
    const uc = new AnalyzeFailureUseCase(prisma as never, badAi, monitoring)

    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({ code: 'AI_API_ERROR' })
  })

  it('throws AI_VALIDATION_ERROR when urgency is invalid enum value', async () => {
    const { prisma, monitoring } = makeDeps()
    const badAi = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: JSON.stringify({ ...VALID_ANALYSIS, urgency: 'ASAP' }),
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
        },
      },
    }
    const uc = new AnalyzeFailureUseCase(prisma as never, badAi, monitoring)

    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({ code: 'AI_VALIDATION_ERROR' })
  })

  it('includes failure code in context when present on the WO', async () => {
    const { prisma, ai, monitoring } = makeDeps({
      woRow: makeWoRow({
        failureCode: { code: 'MECH-003', name: 'Seal failure', category: 'Mechanical' },
      }),
    })
    const uc = new AnalyzeFailureUseCase(prisma as never, ai, monitoring)

    await uc.execute(BASE_INPUT)

    const call = (ai.chat.completions.create as jest.Mock).mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>
    }
    expect(call.messages[1]?.content).toContain('MECH-003')
  })

  it('fetches history scoped to the same asset, excluding the current WO', async () => {
    const { prisma, ai, monitoring } = makeDeps()
    const uc = new AnalyzeFailureUseCase(prisma as never, ai, monitoring)

    await uc.execute(BASE_INPUT)

    const where = (prisma.workOrder.findMany as jest.Mock).mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >
    expect(where.assetId).toBe('asset-1')
    expect(where.id).toMatchObject({ not: WO_ID })
    expect((prisma.workOrder.findMany as jest.Mock).mock.calls[0]?.[0]?.take).toBe(20)
  })
})
