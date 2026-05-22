import { test, expect } from '@playwright/test'
import { createTestTenant } from './helpers/auth'

// Each test in this suite needs its own fresh tenant so the register test
// doesn't collide with credentials used by the login tests.
test.describe('Authentication', () => {
  test('register new tenant + admin → redirects to dashboard', async ({ page, request }) => {
    const suffix = Date.now()
    await page.goto('/register')

    await page.locator('#companyName').fill(`E2E Corp ${suffix}`)
    await page.locator('#slug').fill(`e2e-${suffix}`)
    await page.locator('#adminName').fill('E2E Admin')
    await page.locator('#adminEmail').fill(`admin@e2e-${suffix}.com`)
    await page.locator('#password').fill('Test1234!test')
    await page.locator('#confirmPassword').fill('Test1234!test')

    await page.getByRole('button', { name: 'Create workspace' }).click()

    await page.waitForURL('/dashboard', { timeout: 15_000 })
    await expect(page.getByText('Work Orders')).toBeVisible()
  })

  test('login with wrong password → shows error alert', async ({ page, request }) => {
    // Create a real tenant so we have valid slug/email to test against.
    const tenant = await createTestTenant(request)

    await page.goto('/login')
    await page.locator('#tenantSlug').fill(tenant.slug)
    await page.locator('#email').fill(tenant.email)
    await page.locator('#password').fill('wrong-password-999')

    await page.getByRole('button', { name: 'Sign in' }).click()

    // The API returns a 401; the form renders a destructive Alert.
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 })
  })

  test('login success → token stored in sessionStorage, sidebar visible', async ({
    page,
    request,
  }) => {
    const tenant = await createTestTenant(request)

    await page.goto('/login')
    await page.locator('#tenantSlug').fill(tenant.slug)
    await page.locator('#email').fill(tenant.email)
    await page.locator('#password').fill(tenant.password)

    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('/dashboard', { timeout: 15_000 })

    // Token must be written to sessionStorage on success.
    const token = await page.evaluate(() => sessionStorage.getItem('mh_access_token'))
    expect(token).toBeTruthy()

    // Sidebar nav items confirm the dashboard shell is rendered.
    await expect(page.getByRole('link', { name: 'Work Orders' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Assets' })).toBeVisible()
  })
})
