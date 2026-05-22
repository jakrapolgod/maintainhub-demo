import type { Page, APIRequestContext } from '@playwright/test'

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1'

export interface TestTenant {
  slug: string
  email: string
  password: string
  accessToken: string
  tenantId: string
  userId: string
}

/**
 * Register a fresh tenant + admin user via the API.
 * Uses a timestamp suffix so each call produces a unique slug/email.
 */
export async function createTestTenant(request: APIRequestContext): Promise<TestTenant> {
  const suffix = Date.now()
  const slug = `test-${suffix}`
  const email = `admin@test-${suffix}.com`
  const password = 'Test1234!test'

  const res = await request.post(`${API}/auth/register`, {
    data: {
      companyName: `Test Co ${suffix}`,
      slug,
      adminName: 'Test Admin',
      adminEmail: email,
      password,
    },
  })

  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`createTestTenant failed (${res.status()}): ${body}`)
  }

  const body = await res.json()
  return {
    slug,
    email,
    password,
    accessToken: body.accessToken,
    tenantId: body.tenant.id,
    userId: body.user.id,
  }
}

/**
 * Inject an access token into sessionStorage and navigate to the dashboard,
 * bypassing the login UI. Use this in every non-auth spec to avoid repeating
 * the login flow.
 */
export async function loginAs(page: Page, tenant: TestTenant): Promise<void> {
  // Navigate to any page on the origin first so we can write sessionStorage.
  await page.goto('/login')
  await page.evaluate(
    (token: string) => sessionStorage.setItem('mh_access_token', token),
    tenant.accessToken,
  )
  await page.goto('/dashboard')
  await page.waitForURL('/dashboard')
}

/** Convenience: POST to the API with the tenant's Bearer token. */
export function authHeaders(tenant: TestTenant): Record<string, string> {
  return { Authorization: `Bearer ${tenant.accessToken}` }
}
