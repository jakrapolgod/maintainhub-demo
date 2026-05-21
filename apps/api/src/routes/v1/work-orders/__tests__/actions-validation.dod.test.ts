/**
 * DoD #8 — API input validation: POST /complete without resolution → 400.
 *
 * Acceptance criteria
 * ───────────────────
 * Calling POST /api/v1/work-orders/:id/complete with an empty body, a missing
 * resolution field, or a resolution string shorter than 10 characters MUST
 * return HTTP 400 with a VALIDATION_ERROR code before any command handler runs.
 *
 * Strategy
 * ────────
 * We test the Zod schema directly (unit test) and also simulate the Fastify
 * route's request handling using a lightweight integration approach so we
 * cover the full request→response path without a live database.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

// ── Schema under test (same shape as in actions.ts) ──────────────────────────

const completeBodySchema = z.object({
  resolution:    z.string().trim().min(10, 'Resolution must be at least 10 characters').max(5_000),
  failureCodeId: z.string().cuid().optional(),
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DoD #8 — POST /complete input validation', () => {

  // ── Zod schema unit tests (fast, no HTTP) ────────────────────────────────

  describe('completeBodySchema', () => {
    it('rejects empty body with ZodError', () => {
      const result = completeBodySchema.safeParse({})
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.resolution).toBeDefined()
      }
    })

    it('rejects null resolution', () => {
      const result = completeBodySchema.safeParse({ resolution: null })
      expect(result.success).toBe(false)
    })

    it('rejects resolution shorter than 10 characters', () => {
      const result = completeBodySchema.safeParse({ resolution: 'short' })
      expect(result.success).toBe(false)
      if (!result.success) {
        const msg = result.error.flatten().fieldErrors.resolution?.[0] ?? ''
        expect(msg).toMatch(/at least 10/)
      }
    })

    it('rejects resolution of exactly 9 characters', () => {
      const result = completeBodySchema.safeParse({ resolution: '123456789' }) // 9 chars
      expect(result.success).toBe(false)
    })

    it('accepts resolution of exactly 10 characters', () => {
      const result = completeBodySchema.safeParse({ resolution: '1234567890' })
      expect(result.success).toBe(true)
    })

    it('accepts valid resolution without failureCodeId', () => {
      const result = completeBodySchema.safeParse({ resolution: 'Seal replaced successfully' })
      expect(result.success).toBe(true)
    })

    it('accepts valid resolution with a CUID failureCodeId', () => {
      const result = completeBodySchema.safeParse({
        resolution:    'Seal replaced successfully',
        failureCodeId: 'cm9pq3r2i0000ymbj1nhq1zr2',
      })
      expect(result.success).toBe(true)
    })

    it('rejects an invalid (non-CUID) failureCodeId', () => {
      const result = completeBodySchema.safeParse({
        resolution:    'Seal replaced successfully',
        failureCodeId: 'not-a-cuid',
      })
      expect(result.success).toBe(false)
    })

    it('throws a ZodError when called with .parse() on invalid input', () => {
      expect(() => completeBodySchema.parse({}))
        .toThrow(z.ZodError)
    })
  })

  // ── Fastify app integration test (buildApp → inject) ─────────────────────

  describe('HTTP route integration', () => {
    let app: FastifyInstance

    beforeAll(async () => {
      // Set minimal env vars required by config.ts Zod parse.
      // Using dot notation via Object.assign to satisfy the dot-notation lint rule
      // (process.env keys are dynamic strings and must use assignment here).
      Object.assign(process.env, {
        DATABASE_URL:       process.env.DATABASE_URL       ?? 'postgresql://x:x@localhost:5432/x',
        JWT_ACCESS_SECRET:  process.env.JWT_ACCESS_SECRET  ?? 'test-secret-at-least-32-characters-long!!',
        JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'test-refresh-at-least-32-characters-long!',
      })

      // Jest runs in CJS mode so we must use `require` for a relative module import.
      // Both lint rules are disabled for this one line — no alternative in Jest CJS.
      /* eslint-disable @typescript-eslint/no-require-imports, global-require, @typescript-eslint/consistent-type-imports */
      const mod = require('../../../../app') as { buildApp(): FastifyInstance }
      /* eslint-enable @typescript-eslint/no-require-imports, global-require, @typescript-eslint/consistent-type-imports */
      app = mod.buildApp()
      await app.ready()
    })

    afterAll(async () => {
      if (app) {
        try { await app.close() } catch { /* ignore cleanup errors in test env */ }
      }
    })

    /** Generate a signed JWT for a MANAGER user — no DB round-trip needed. */
    function managerToken(): string {
      return app.jwt.sign({
        sub:   'user-manager-1',
        tid:   'tenant-1',
        role:  'MANAGER',
        email: 'mgr@test.com',
        slug:  'test',
      })
    }

    it('returns 400 VALIDATION_ERROR when resolution is missing', async () => {
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/work-orders/fake-id/complete',
        headers: { authorization: `Bearer ${managerToken()}` },
        payload: {},
      })

      expect(res.statusCode).toBe(400)
      const body = res.json<{ code: string }>()
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 VALIDATION_ERROR when resolution is too short (< 10 chars)', async () => {
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/work-orders/fake-id/complete',
        headers: { authorization: `Bearer ${managerToken()}` },
        payload: { resolution: 'short' },
      })

      expect(res.statusCode).toBe(400)
      const body = res.json<{ code: string }>()
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 VALIDATION_ERROR with an empty string resolution', async () => {
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/work-orders/fake-id/complete',
        headers: { authorization: `Bearer ${managerToken()}` },
        payload: { resolution: '' },
      })

      expect(res.statusCode).toBe(400)
    })

    it('does NOT return 400 when resolution has 10+ characters (validation passes)', async () => {
      // With valid input, validation passes and the handler fires.
      // 'fake-id' won't match any WO so we expect 404 — NOT 400.
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/work-orders/fake-id/complete',
        headers: { authorization: `Bearer ${managerToken()}` },
        payload: { resolution: 'Seal replaced and tested OK' },
      })

      expect(res.statusCode).not.toBe(400)
    })
  })
})
