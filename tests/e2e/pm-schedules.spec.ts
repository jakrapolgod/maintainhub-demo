import { test, expect } from '@playwright/test'
import { addMonths, startOfDay, format } from 'date-fns'
import { createTestTenant, loginAs, authHeaders, type TestTenant } from './helpers/auth'

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1'

let tenant: TestTenant
let assetId: string
let categoryId: string

test.beforeAll(async ({ request }) => {
  tenant = await createTestTenant(request)

  const catRes = await request.post(`${API}/assets/categories`, {
    headers: authHeaders(tenant),
    data: { name: 'HVAC', code: 'HVAC', description: 'HVAC systems' },
  })
  categoryId = (await catRes.json()).id

  const assetRes = await request.post(`${API}/assets`, {
    headers: authHeaders(tenant),
    data: {
      name: 'E2E Air Handler AH-401',
      categoryId,
      criticality: 'B',
      installDate: '2024-03-01',
    },
  })
  assetId = (await assetRes.json()).id
})

test.describe('Preventive Maintenance', () => {
  test('create monthly PM schedule → preview shows correct next-due date', async ({ page }) => {
    await loginAs(page, tenant)
    await page.goto('/pm-schedules/new')

    // ── Step 1: Basic Info ──────────────────────────────────────────────────
    // Asset select (Radix UI).
    await page.getByText('Select asset…').click()
    await page.getByRole('option', { name: 'E2E Air Handler AH-401' }).click()

    await page.locator('#title').fill('Monthly Filter Replacement')
    await page.getByRole('button', { name: 'Next' }).click()

    // ── Step 2: Trigger Type → CALENDAR ────────────────────────────────────
    await page.getByRole('radio', { name: /time.based recurrence/i }).click()

    // Set frequency to Monthly and interval to 1.
    await page.getByText('Select frequency').click()
    await page.getByRole('option', { name: 'Monthly' }).click()

    // The interval field defaults to 1; verify the preview renders a near-future date.
    // Preview text pattern: "Every 1 Monthly → <date>"
    const expectedMonth = format(addMonths(startOfDay(new Date()), 1), 'MMM')
    await expect(page.getByText(new RegExp(`Every 1.*${expectedMonth}`, 'i'))).toBeVisible({
      timeout: 5_000,
    })

    await page.getByRole('button', { name: 'Next' }).click()

    // ── Step 3: Tasks ───────────────────────────────────────────────────────
    await page.getByRole('button', { name: '+ Add Task' }).click()
    await page.locator('input[placeholder="Task title *"]').first().fill('Replace filter cartridge')
    await page.getByRole('button', { name: 'Next' }).click()

    // ── Step 4: Resources ───────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Next' }).click()

    // ── Step 5: Review → Create ─────────────────────────────────────────────
    await page.getByRole('button', { name: 'Create Schedule' }).click()

    // After creation the app navigates back to the PM schedules list.
    await page.waitForURL('/pm-schedules', { timeout: 15_000 })
    await expect(page.getByText('Monthly Filter Replacement')).toBeVisible()
  })

  test('manual trigger → work order created automatically', async ({ page, request }) => {
    // Create an active PM schedule via API so we can test the trigger button.
    const pmRes = await request.post(`${API}/pm-schedules`, {
      headers: authHeaders(tenant),
      data: {
        assetId,
        title: 'E2E Trigger Test Schedule',
        triggerType: 'CALENDAR',
        frequency: 'MONTHLY',
        intervalValue: 1,
        advanceNoticeDays: 3,
        tasks: [{ title: 'Inspect belts', sequence: 1 }],
      },
    })
    const pm = await pmRes.json()

    // Activate it so the trigger button is enabled.
    await request.post(`${API}/pm-schedules/${pm.id}/activate`, {
      headers: authHeaders(tenant),
    })

    await loginAs(page, tenant)
    await page.goto('/pm-schedules')

    // The Zap icon button has title="Manual trigger" on the list row.
    const triggerBtn = page.getByTitle('Manual trigger').first()
    await expect(triggerBtn).toBeEnabled({ timeout: 10_000 })
    await triggerBtn.click()

    // The UI shows a success toast / updates the "Last Triggered" column.
    // Navigate to work orders and verify the auto-created WO exists.
    await page.goto('/work-orders')
    await expect(page.getByText('E2E Trigger Test Schedule')).toBeVisible({ timeout: 15_000 })
  })
})
