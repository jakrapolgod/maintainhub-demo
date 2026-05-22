import { test, expect } from '@playwright/test'
import { createTestTenant, loginAs, authHeaders, type TestTenant } from './helpers/auth'

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1'

// ---------------------------------------------------------------------------
// Shared setup: one tenant + one asset created via API for the whole suite.
// ---------------------------------------------------------------------------

let tenant: TestTenant
let assetId: string
let categoryId: string

test.beforeAll(async ({ request }) => {
  tenant = await createTestTenant(request)

  // Create a category so the asset form is satisfied.
  const catRes = await request.post(`${API}/assets/categories`, {
    headers: authHeaders(tenant),
    data: { name: 'Pump', code: 'PUMP', description: 'Pump assets' },
  })
  categoryId = (await catRes.json()).id

  // Create the asset we'll attach work orders to.
  const assetRes = await request.post(`${API}/assets`, {
    headers: authHeaders(tenant),
    data: {
      name: 'Test Pump P-101',
      categoryId,
      criticality: 'B',
      installDate: '2024-01-01',
      serialNumber: 'SN-E2E-001',
    },
  })
  const asset = await assetRes.json()
  assetId = asset.id
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Work Orders', () => {
  test('create WO via AI chat: draft confirmed → WO number assigned', async ({ page }) => {
    await loginAs(page, tenant)

    // Intercept the AI draft endpoint so the test is not dependent on
    // Anthropic availability and runs deterministically.
    await page.route('**/work-orders/ai/draft', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          title: 'Pump bearing noise investigation',
          description: 'Investigate and resolve abnormal bearing noise on asset.',
          type: 'CORRECTIVE',
          priority: 'HIGH',
          estimatedHours: 2,
          assetId,
        }),
      })
    })

    await page.goto('/work-orders/new')

    // Switch to AI Chat mode.
    await page.getByRole('button', { name: 'AI Chat' }).click()

    // Type the maintenance request.
    await page.getByPlaceholder('Describe the maintenance issue…').fill(
      'pump bearing noise in asset AST-000001',
    )
    await page.getByRole('button', { name: /send/i }).click()

    // Wait for the draft card to appear (populated by the mocked API response).
    await expect(page.getByText('Pump bearing noise investigation')).toBeVisible({
      timeout: 15_000,
    })

    // Confirm the draft → creates the real WO in the DB.
    await page.getByRole('button', { name: 'Confirm' }).click()

    // After creation the app navigates to the WO detail page.
    // The WO number badge (e.g. WO-000001) must be visible.
    await expect(page.getByText(/WO-\d{6}/)).toBeVisible({ timeout: 15_000 })
  })

  test('status transitions: OPEN → IN_PROGRESS → COMPLETED', async ({ page, request }) => {
    // Create a WO via API so we start from a known state.
    const woRes = await request.post(`${API}/work-orders`, {
      headers: authHeaders(tenant),
      data: {
        title: 'E2E Status Flow Test',
        type: 'CORRECTIVE',
        priority: 'MEDIUM',
        assetId,
      },
    })
    const wo = await woRes.json()

    await loginAs(page, tenant)
    await page.goto(`/work-orders/${wo.id}`)

    // ── OPEN → IN_PROGRESS ──────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByText('IN_PROGRESS')).toBeVisible({ timeout: 10_000 })

    // ── IN_PROGRESS → COMPLETED ─────────────────────────────────────────────
    await page.getByRole('button', { name: 'Complete' }).click()

    // Fill in the required resolution (min 10 chars).
    const resolutionInput = page.getByPlaceholder(
      'Describe what was done and the outcome',
    )
    await resolutionInput.fill('Bearing replaced and tested OK. Noise eliminated.')
    await page.getByRole('button', { name: 'Mark Complete' }).click()

    await expect(page.getByText('COMPLETED')).toBeVisible({ timeout: 10_000 })
  })

  test('completed WO appears in History tab', async ({ page, request }) => {
    // Create + complete a WO via API so we have audit entries.
    const woRes = await request.post(`${API}/work-orders`, {
      headers: authHeaders(tenant),
      data: {
        title: 'E2E History Check',
        type: 'CORRECTIVE',
        priority: 'LOW',
        assetId,
      },
    })
    const wo = await woRes.json()

    await request.post(`${API}/work-orders/${wo.id}/start`, {
      headers: authHeaders(tenant),
    })
    await request.post(`${API}/work-orders/${wo.id}/complete`, {
      headers: authHeaders(tenant),
      data: { resolution: 'Completed via API for history test.' },
    })

    await loginAs(page, tenant)
    await page.goto(`/work-orders/${wo.id}`)

    // Open the History tab.
    await page.getByRole('tab', { name: 'History' }).click()

    // Audit trail must contain at least one completion entry.
    await expect(page.getByText(/complete/i)).toBeVisible({ timeout: 10_000 })
  })
})
