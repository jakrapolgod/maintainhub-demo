import { test, expect } from '@playwright/test'
import { createTestTenant, loginAs, authHeaders, type TestTenant } from './helpers/auth'

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1'

let tenant: TestTenant
let categoryId: string

test.beforeAll(async ({ request }) => {
  tenant = await createTestTenant(request)

  const catRes = await request.post(`${API}/assets/categories`, {
    headers: authHeaders(tenant),
    data: { name: 'Machinery', code: 'MACH', description: 'Machinery assets' },
  })
  categoryId = (await catRes.json()).id
})

test.describe('Asset Management', () => {
  test('create asset with required fields → appears in asset list', async ({ page }) => {
    await loginAs(page, tenant)
    await page.goto('/assets')

    await page.getByRole('button', { name: 'New Asset' }).click()

    // Fill required fields in the AssetForm sheet.
    await page.locator('#name').fill('E2E Compressor C-201')

    // Category select (Radix UI — click trigger, then option).
    await page.getByText('Select category').click()
    await page.getByRole('option', { name: 'Machinery' }).click()

    // Criticality select.
    await page.getByText('Select criticality').click()
    await page.getByRole('option', { name: /B.*High/i }).click()

    await page.locator('#installDate').fill('2024-06-01')

    await page.getByRole('button', { name: 'Create Asset' }).click()

    // The sheet closes and the new asset should appear in the table.
    await expect(page.getByText('E2E Compressor C-201')).toBeVisible({ timeout: 15_000 })
  })

  test('upload document to asset → file visible in Documents tab', async ({
    page,
    request,
  }) => {
    // Create the asset via API so document upload is the only UI action.
    const assetRes = await request.post(`${API}/assets`, {
      headers: authHeaders(tenant),
      data: {
        name: 'E2E Motor M-301',
        categoryId,
        criticality: 'C',
        installDate: '2024-01-15',
      },
    })
    const asset = await assetRes.json()

    await loginAs(page, tenant)
    await page.goto(`/assets/${asset.id}`)

    await page.getByRole('tab', { name: 'Documents' }).click()

    // The dropzone exposes a hidden <input type="file">; Playwright can target it directly.
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'maintenance-manual.pdf',
      mimeType: 'application/pdf',
      // Minimal 1-byte valid "file" for upload testing.
      buffer: Buffer.from('%PDF-1.4 test'),
    })

    // After upload the file card should display the filename.
    await expect(page.getByText('maintenance-manual.pdf')).toBeVisible({ timeout: 15_000 })
  })

  test('search asset by serial number → result highlighted in list', async ({
    page,
    request,
  }) => {
    const serial = `SN-SEARCH-${Date.now()}`

    await request.post(`${API}/assets`, {
      headers: authHeaders(tenant),
      data: {
        name: 'E2E Searchable Pump',
        categoryId,
        criticality: 'D',
        installDate: '2023-11-01',
        serialNumber: serial,
      },
    })

    await loginAs(page, tenant)
    await page.goto('/assets')

    await page.getByPlaceholder('Search assets…').fill(serial)

    // Wait for the debounced search to settle and the row to appear.
    await expect(page.getByText('E2E Searchable Pump')).toBeVisible({ timeout: 15_000 })
  })
})
