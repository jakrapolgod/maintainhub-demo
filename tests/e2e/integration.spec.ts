/**
 * Integration tests — Webhook endpoints & API token verification.
 *
 * Implementation note
 * ───────────────────
 * Webhook CRUD routes and an API-key feature are not yet registered in the
 * v1 router (Phase 1 scope).  These tests use Playwright's `request` context
 * to drive the API layer directly.  They will be green once the routes are
 * wired up in Phase 2 and serve as the acceptance criteria for that work.
 *
 * The first test ("API token auth") exercises an endpoint that already exists
 * and passes today — confirming the JWT Bearer token flow is end-to-end correct.
 */
import { test, expect } from '@playwright/test'
import { createTestTenant, authHeaders, type TestTenant } from './helpers/auth'

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1'

let tenant: TestTenant

test.beforeAll(async ({ request }) => {
  tenant = await createTestTenant(request)
})

test.describe('Integration — Webhooks & API Auth', () => {
  test('Bearer token works end-to-end: GET /me returns authenticated user', async ({
    request,
  }) => {
    const res = await request.get(`${API}/me`, {
      headers: authHeaders(tenant),
    })
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.email).toBe(tenant.email)
    expect(body.tenant.slug).toBe(tenant.slug)
    expect(body.role).toBe('ADMIN')
  })

  // ── Webhook tests (Phase 2) ────────────────────────────────────────────────
  // These define the HTTP contract; they will pass once Phase 2 adds the routes.

  test.fixme(
    'create webhook endpoint → test delivery → verify success status',
    async ({ request }) => {
      // Create endpoint.
      const createRes = await request.post(`${API}/webhooks`, {
        headers: authHeaders(tenant),
        data: {
          url: 'https://webhook.site/test',
          events: ['work_order.created', 'work_order.completed'],
          description: 'E2E test webhook',
        },
      })
      expect(createRes.status()).toBe(201)
      const endpoint = await createRes.json()
      expect(endpoint.id).toBeTruthy()
      expect(endpoint.isActive).toBe(true)

      // Trigger a test delivery.
      const testRes = await request.post(`${API}/webhooks/${endpoint.id}/test`, {
        headers: authHeaders(tenant),
      })
      expect(testRes.status()).toBe(200)
      const delivery = await testRes.json()
      expect(delivery.status).toBe('delivered')

      // Delivery must appear in history.
      const historyRes = await request.get(`${API}/webhooks/${endpoint.id}/deliveries`, {
        headers: authHeaders(tenant),
      })
      expect(historyRes.status()).toBe(200)
      const history = await historyRes.json()
      expect(history.data.length).toBeGreaterThan(0)
      expect(history.data[0].status).toBe('delivered')
    },
  )

  test.fixme(
    'API key: generate → shown once → accepted on subsequent requests',
    async ({ request }) => {
      // Generate an API key for the tenant.
      const genRes = await request.post(`${API}/api-keys`, {
        headers: authHeaders(tenant),
        data: { name: 'E2E test key', expiresAt: null },
      })
      expect(genRes.status()).toBe(201)
      const { key, id } = await genRes.json()

      // The raw key is returned exactly once; subsequent GET must not expose it.
      expect(key).toMatch(/^mh_/)

      const getRes = await request.get(`${API}/api-keys/${id}`, {
        headers: authHeaders(tenant),
      })
      const stored = await getRes.json()
      expect(stored.key).toBeUndefined()

      // The key must work as a Bearer token on authenticated endpoints.
      const meRes = await request.get(`${API}/me`, {
        headers: { Authorization: `Bearer ${key}` },
      })
      expect(meRes.status()).toBe(200)
    },
  )
})
