/**
 * Unit tests for GeneratePMScheduleFromAssetType.
 */
import { GeneratePMScheduleFromAssetType } from '../generate-pm-schedule.js'
import { AiError } from '../pm-ai.types.js'
import type { AnthropicClient } from '../pm-ai.types.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_RESPONSE = JSON.stringify({
  schedules: [
    {
      title: 'Monthly Inspection',
      description: 'Inspect all critical components',
      frequency: 'monthly',
      interval: 1,
      estimatedHours: 2,
      advanceNoticeDays: 7,
      rationale: 'Prevents bearing failure',
      tasks: [
        {
          sequence: 1,
          title: 'Check oil level',
          instructions: 'Remove dipstick and verify oil is at the MAX mark',
          requiresPhoto: true,
          requiresMeterReading: false,
          estimatedMinutes: 15,
          isCritical: false,
        },
        {
          sequence: 2,
          title: 'Inspect seals',
          instructions: 'Visually inspect all mechanical seals for leaks',
          requiresPhoto: true,
          requiresMeterReading: false,
          estimatedMinutes: 20,
          isCritical: true,
        },
      ],
    },
  ],
})

function makeAI(responseText: string): AnthropicClient {
  return {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
        usage: { input_tokens: 100, output_tokens: 200 },
      }),
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GeneratePMScheduleFromAssetType', () => {
  it('returns validated schedule suggestions for a centrifugal pump', async () => {
    const useCase = new GeneratePMScheduleFromAssetType(makeAI(VALID_RESPONSE))
    const result = await useCase.execute({ assetType: 'Centrifugal Pump' })

    expect(result.schedules).toHaveLength(1)
    expect(result.schedules[0]!.title).toBe('Monthly Inspection')
    expect(result.schedules[0]!.frequency).toBe('monthly')
    expect(result.schedules[0]!.tasks).toHaveLength(2)
    expect(result.schedules[0]!.tasks[1]!.isCritical).toBe(true)
  })

  it('passes manufacturer and model to the AI', async () => {
    const ai = makeAI(VALID_RESPONSE)
    const useCase = new GeneratePMScheduleFromAssetType(ai)

    await useCase.execute({
      assetType: 'Centrifugal Pump',
      manufacturer: 'Grundfos',
      model: 'CR 10-4',
    })

    const createCall = (ai.messages.create as jest.Mock).mock.calls[0][0] as {
      messages: Array<{ content: string }>
    }
    expect(createCall.messages[0]!.content).toContain('Grundfos')
    expect(createCall.messages[0]!.content).toContain('CR 10-4')
  })

  it('throws AI_API_ERROR when assetType is empty', async () => {
    const useCase = new GeneratePMScheduleFromAssetType(makeAI(VALID_RESPONSE))
    await expect(useCase.execute({ assetType: '' })).rejects.toMatchObject({ code: 'AI_API_ERROR' })
  })

  it('throws AI_API_ERROR when Anthropic API fails', async () => {
    const ai = {
      messages: {
        create: jest.fn().mockRejectedValue(new Error('Network error')),
      },
    }
    const useCase = new GeneratePMScheduleFromAssetType(ai)
    await expect(useCase.execute({ assetType: 'Pump' })).rejects.toMatchObject({
      code: 'AI_API_ERROR',
    })
  })

  it('throws AI_PARSE_ERROR when response is not JSON', async () => {
    const useCase = new GeneratePMScheduleFromAssetType(makeAI('This is not JSON'))
    await expect(useCase.execute({ assetType: 'Pump' })).rejects.toMatchObject({
      code: 'AI_PARSE_ERROR',
    })
  })

  it('throws AI_VALIDATION_ERROR when JSON does not match schema', async () => {
    const badJson = JSON.stringify({ schedules: [{ title: 'Bad', tasks: [] }] })
    const useCase = new GeneratePMScheduleFromAssetType(makeAI(badJson))
    await expect(useCase.execute({ assetType: 'Pump' })).rejects.toMatchObject({
      code: 'AI_VALIDATION_ERROR',
    })
  })

  it('strips markdown code fences from AI response', async () => {
    const wrapped = `\`\`\`json\n${VALID_RESPONSE}\n\`\`\``
    const useCase = new GeneratePMScheduleFromAssetType(makeAI(wrapped))
    const result = await useCase.execute({ assetType: 'Pump' })
    expect(result.schedules).toHaveLength(1)
  })

  it('records token usage via monitoring port', async () => {
    const monitoring = { recordTokenUsage: jest.fn() }
    const useCase = new GeneratePMScheduleFromAssetType(makeAI(VALID_RESPONSE), monitoring)

    await useCase.execute({ assetType: 'Pump' })

    expect(monitoring.recordTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        useCase: 'GeneratePMSchedule',
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
      }),
    )
  })

  it('validates that tasks array must be non-empty', async () => {
    const emptyTasks = JSON.stringify({
      schedules: [
        {
          title: 'Test',
          description: 'Desc',
          frequency: 'monthly',
          interval: 1,
          estimatedHours: 1,
          tasks: [],
        },
      ],
    })
    const useCase = new GeneratePMScheduleFromAssetType(makeAI(emptyTasks))
    await expect(useCase.execute({ assetType: 'Pump' })).rejects.toMatchObject({
      code: 'AI_VALIDATION_ERROR',
    })
  })

  it('AiError is instanceof Error', () => {
    const err = new AiError('test', 'AI_API_ERROR')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AiError')
    expect(err.code).toBe('AI_API_ERROR')
    expect(err.statusCode).toBe(502)
  })
})
