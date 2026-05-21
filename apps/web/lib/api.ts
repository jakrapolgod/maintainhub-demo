/**
 * Typed API client for the MaintainHub backend.
 *
 * All requests go through the `apiFetch` helper which:
 *  - Reads the access token from sessionStorage
 *  - Injects Authorization: Bearer headers automatically
 *  - Normalises error shapes into ApiError instances
 *  - Returns typed data on success
 */

// ── Base URL ──────────────────────────────────────────────────────────────────

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'

// ── Error type ────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ── Token storage helpers ────────────────────────────────────────────────────

const TOKEN_KEY = 'mh_access_token'

export const tokenStore = {
  get: (): string | null =>
    typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null,
  set: (token: string): void => sessionStorage.setItem(TOKEN_KEY, token),
  clear: (): void => sessionStorage.removeItem(TOKEN_KEY),
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export async function apiFetch<T>(
  path: string,
  method: HttpMethod = 'GET',
  body?: unknown,
  opts?: { skipAuth?: boolean },
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (!opts?.skipAuth) {
    const token = tokenStore.get()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include', // include httpOnly refresh token cookie
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

  if (!res.ok) {
    let payload: { code?: string; message?: string; details?: Record<string, string[]> } = {}
    try {
      payload = (await res.json()) as typeof payload
    } catch {
      // non-JSON error body
    }
    throw new ApiError(
      payload.code ?? 'UNKNOWN_ERROR',
      payload.message ?? `Request failed with status ${res.status}`,
      res.status,
      payload.details,
    )
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export interface LoginPayload {
  email: string
  password: string
  tenantSlug: string
}

export interface RegisterPayload {
  companyName: string
  slug: string
  adminEmail: string
  adminName: string
  password: string
}

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  tenantId: string
}

export interface AuthTenant {
  id: string
  name: string
  slug: string
  plan: string
}

export interface AuthResponse {
  accessToken: string
  user: AuthUser
  tenant: AuthTenant
}

export interface MeResponse {
  id: string
  email: string
  name: string
  role: string
  jobTitle: string | null
  phone: string | null
  avatarUrl: string | null
  lastLoginAt: string | null
  tenantId: string
  tenant: AuthTenant
}

export const authApi = {
  login: (payload: LoginPayload) =>
    apiFetch<AuthResponse>('/auth/login', 'POST', payload, { skipAuth: true }),

  register: (payload: RegisterPayload) =>
    apiFetch<AuthResponse>('/auth/register', 'POST', payload, { skipAuth: true }),

  refresh: () =>
    apiFetch<{ accessToken: string }>('/auth/refresh', 'POST', undefined, { skipAuth: true }),

  logout: () => apiFetch<void>('/auth/logout', 'POST'),

  forgotPassword: (email: string, tenantSlug: string) =>
    apiFetch<{ message: string }>(
      '/auth/forgot-password',
      'POST',
      { email, tenantSlug },
      { skipAuth: true },
    ),

  resetPassword: (token: string, password: string) =>
    apiFetch<{ message: string }>(
      '/auth/reset-password',
      'POST',
      { token, password },
      { skipAuth: true },
    ),

  me: () => apiFetch<MeResponse>('/me'),
}
