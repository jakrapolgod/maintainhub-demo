import { GenerateWorkInstructionsUseCase } from '../generate-work-instructions'
import type { GenerateWorkInstructionsInput } from '../generate-work-instructions'

// ── Helpers ───────────────────────────────────────────────────────────────────

const WO_ID = 'wo-1'
const TENANT = 'tenant-1'

const PROCEDURE_MD = `## ⚠️ Safety Warnings
- Lock out / tag out (LOTO) pump before any work
- Wear chemical-resistant gloves and safety glasses

## Required Tools & PPE
- Tools: Torque wrench, bearing puller, seal installation tool
- PPE: Safety glasses, gloves, steel-toe boots

## Procedure
1. Isolate pump and apply LOTO
2. Drain pump casing
3. Remove coupling guard and coupling
4. Extract worn seal
5. Install new seal per manufacturer spec (torque: 25 Nm)
6. Reassemble and test

## Completion Checklist
- [ ] LOTO removed after work completion
- [ ] No leaks at shaft area
- [ ] Pump runs smoothly for 10 minutes

## Reference Notes
- Grundfos CR 5-8 seal kit: P/N 96534678
- Max shaft run-out: 0.05 mm`

function makeWoRow(overrides = {}) {
  return {
    id: WO_ID,
    woNumber: 'WO-2024-000001',
    title: 'Replace mechanical seal',
    description: 'Pump is leaking from shaft area',
    type: 'CORRECTIVE',
    priority: 'HIGH',
    assigneeIds: ['tech-1', 'tech-2'],
    assetId: 'asset-1',
    asset: {
      name: 'Pump P-101',
      criticality: 'B',
      manufacturer: 'Grundfos',
      model: 'CR 5-8',
      serialNumber: 'GF2024-001',
      description: null,
      category: { name: 'Rotating Equipment' },
      location: { name: 'Building A' },
      pmSchedules: [],
    },
    failureCode: null,
    ...overrides,
  }
}

function makeDeps(
  opts: {
    woRow?: ReturnType<typeof makeWoRow> | null
    procedure?: string
  } = {},
) {
  const { woRow = makeWoRow(), procedure = PROCEDURE_MD } = opts

  const prisma = {
    workOrder: {
      findFirst: jest.fn().mockResolvedValue(woRow),
    },
  }

  const ai = {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: procedure }],
        usage: { input_tokens: 300, output_tokens: 400 },
      }),
    },
  }

  const monitoring = { recordTokenUsage: jest.fn() }

  return { prisma, ai, monitoring }
}

const BASE_INPUT: GenerateWorkInstructionsInput = { workOrderId: WO_ID, tenantId: TENANT }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GenerateWorkInstructionsUseCase', () => {
  it('returns procedure, woNumber, and assetName', async () => {
    const { prisma, ai, monitoring } = makeDeps()
    const uc = new GenerateWorkInstructionsUseCase(prisma as never, ai, monitoring)

    const result = await uc.execute(BASE_INPUT)

    expect(result.woNumber).toBe('WO-2024-000001')
    expect(result.assetName).toBe('Pump P-101')
    expect(result.procedure).toContain('## ⚠️ Safety Warnings')
  })

  it('returns the raw markdown procedure from Claude', async () => {
    const { prisma, ai, monitoring } = makeDeps()
    const uc = new GenerateWorkInstructionsUseCase(prisma as never, ai, monitoring)

    const result = await uc.execute(BASE_INPUT)

    expect(result.procedure).toBe(PROCEDURE_MD)
  })

  it('throws NOT_FOUND when work order does not exist', async () => {
    const { prisma, ai, monitoring } = makeDeps({ woRow: null })
    const uc = new GenerateWorkInstructionsUseCase(prisma as never, ai, monitoring)

    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('includes WO title and asset name in the AI prompt', async () => {
    const { prisma, ai, monitoring } = makeDeps()
    const uc = new GenerateWorkInstructionsUseCase(prisma as never, ai, monitoring)

    await uc.execute(BASE_INPUT)

    const call = (ai.messages.create as jest.Mock).mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>
    }
    const content = call.messages[0]?.content ?? ''
    expect(content).toContain('Replace mechanical seal')
    expect(content).toContain('Pump P-101')
    expect(content).toContain('Grundfos CR 5-8')
  })

  it('includes serial number when present', async () => {
    const { prisma, ai, monitoring } = makeDeps()
    const uc = new GenerateWorkInstructionsUseCase(prisma as never, ai, monitoring)

    await uc.execute(BASE_INPUT)

    const call = (ai.messages.create as jest.Mock).mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>
    }
    expect(call.messages[0]?.content).toContain('GF2024-001')
  })

  it('includes team size hint when multiple assignees', async () => {
    const { prisma, ai, monitoring } = makeDeps()
    const uc = new GenerateWorkInstructionsUseCase(prisma as never, ai, monitoring)

    await uc.execute(BASE_INPUT)

    const call = (ai.messages.create as jest.Mock).mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>
    }
    expect(call.messages[0]?.content).toContain('2 technicians')
  })

  it('includes required skills when PM schedule is present', async () => {
    const woWithPm = makeWoRow({
      asset: {
        name: 'Pump P-101',
        criticality: 'B',
        manufacturer: 'Grundfos',
        model: 'CR 5-8',
        serialNumber: null,
        description: null,
        category: { name: 'Rotating Equipment' },
        location: null,
        pmSchedules: [
          {
            requiredSkills: ['mechanical-technician', 'electrician'],
            estimatedHours: 4,
            taskList: [],
          },
        ],
      },
    })
    const { prisma, ai, monitoring } = makeDeps({ woRow: woWithPm })
    const uc = new GenerateWorkInstructionsUseCase(prisma as never, ai, monitoring)

    await uc.execute(BASE_INPUT)

    const call = (ai.messages.create as jest.Mock).mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>
    }
    expect(call.messages[0]?.content).toContain('mechanical-technician')
  })

  it('includes failure code when present on the WO', async () => {
    const woWithFc = makeWoRow({
      failureCode: { code: 'MECH-003', name: 'Seal failure', category: 'Mechanical', notes: null },
    })
    const { prisma, ai, monitoring } = makeDeps({ woRow: woWithFc })
    const uc = new GenerateWorkInstructionsUseCase(prisma as never, ai, monitoring)

    await uc.execute(BASE_INPUT)

    const call = (ai.messages.create as jest.Mock).mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>
    }
    expect(call.messages[0]?.content).toContain('MECH-003')
  })

  it('records token usage', async () => {
    const { prisma, ai, monitoring } = makeDeps()
    const uc = new GenerateWorkInstructionsUseCase(prisma as never, ai, monitoring)

    await uc.execute(BASE_INPUT)

    expect(monitoring.recordTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        useCase: 'GenerateWorkInstructions',
        totalTokens: 700,
      }),
    )
  })

  it('wraps Anthropic API errors in AI_API_ERROR', async () => {
    const { prisma, monitoring } = makeDeps()
    const badAi = {
      messages: { create: jest.fn().mockRejectedValue(new Error('network error')) },
    }
    const uc = new GenerateWorkInstructionsUseCase(prisma as never, badAi, monitoring)

    await expect(uc.execute(BASE_INPUT)).rejects.toMatchObject({ code: 'AI_API_ERROR' })
  })

  it('trims whitespace from the returned procedure', async () => {
    const { prisma, monitoring } = makeDeps()
    const paddedAi = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: `  \n${PROCEDURE_MD}\n  ` }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      },
    }
    const uc = new GenerateWorkInstructionsUseCase(prisma as never, paddedAi, monitoring)

    const result = await uc.execute(BASE_INPUT)
    expect(result.procedure.startsWith('##')).toBe(true)
    expect(result.procedure.endsWith('mm')).toBe(true)
  })
})
