import { z } from 'zod'
import { AiError, extractText, parseAiJson, recordUsage } from '../ai.types'
import type { AnthropicMessage, MonitoringPort } from '../ai.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMessage(text: string): AnthropicMessage {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 20 },
  }
}

const simpleSchema = z.object({ value: z.string() })

// ── extractText ───────────────────────────────────────────────────────────────

describe('extractText', () => {
  it('returns the text from the first text block', () => {
    expect(extractText(makeMessage('hello'))).toBe('hello')
  })

  it('skips non-text blocks and finds the text block', () => {
    const msg: AnthropicMessage = {
      content: [{ type: 'tool_use' }, { type: 'text', text: 'found' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    }
    expect(extractText(msg)).toBe('found')
  })

  it('throws AI_PARSE_ERROR when no text block present', () => {
    const msg: AnthropicMessage = {
      content: [{ type: 'tool_use' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    }
    expect(() => extractText(msg)).toThrow(expect.objectContaining({ code: 'AI_PARSE_ERROR' }))
  })
})

// ── parseAiJson ───────────────────────────────────────────────────────────────

describe('parseAiJson', () => {
  it('parses valid JSON matching the schema', () => {
    const result = parseAiJson('{"value":"ok"}', simpleSchema)
    expect(result.value).toBe('ok')
  })

  it('strips leading ```json fence', () => {
    const result = parseAiJson('```json\n{"value":"stripped"}\n```', simpleSchema)
    expect(result.value).toBe('stripped')
  })

  it('strips leading ``` fence without language', () => {
    const result = parseAiJson('```\n{"value":"also-stripped"}\n```', simpleSchema)
    expect(result.value).toBe('also-stripped')
  })

  it('throws AI_PARSE_ERROR on invalid JSON', () => {
    expect(() => parseAiJson('{not json}', simpleSchema)).toThrow(
      expect.objectContaining({ code: 'AI_PARSE_ERROR' }),
    )
  })

  it('throws AI_VALIDATION_ERROR when JSON does not match schema', () => {
    expect(() => parseAiJson('{"wrong":"field"}', simpleSchema)).toThrow(
      expect.objectContaining({ code: 'AI_VALIDATION_ERROR' }),
    )
  })
})

// ── recordUsage ───────────────────────────────────────────────────────────────

describe('recordUsage', () => {
  it('calls monitoring.recordTokenUsage with correct data', () => {
    const monitoring: MonitoringPort = { recordTokenUsage: jest.fn() }
    const msg = makeMessage('test')

    recordUsage(monitoring, 'MyUseCase', msg)

    expect(monitoring.recordTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        useCase: 'MyUseCase',
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      }),
    )
  })

  it('swallows errors from monitoring', () => {
    const monitoring: MonitoringPort = {
      recordTokenUsage: () => {
        throw new Error('monitoring down')
      },
    }
    expect(() => recordUsage(monitoring, 'X', makeMessage('y'))).not.toThrow()
  })
})

// ── AiError ───────────────────────────────────────────────────────────────────

describe('AiError', () => {
  it('has the correct code and statusCode', () => {
    const err = new AiError('bad response', 'AI_PARSE_ERROR')
    expect(err.code).toBe('AI_PARSE_ERROR')
    expect(err.statusCode).toBe(502)
    expect(err.name).toBe('AiError')
  })

  it('accepts a custom statusCode', () => {
    const err = new AiError('missing key', 'AI_UNAVAILABLE', 503)
    expect(err.statusCode).toBe(503)
  })
})
