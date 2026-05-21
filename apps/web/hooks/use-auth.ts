'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { authApi, tokenStore, type LoginPayload, type RegisterPayload } from '@/lib/api'

// ── Query keys ────────────────────────────────────────────────────────────────

export const authKeys = {
  me: ['auth', 'me'] as const,
}

// ── Current user ──────────────────────────────────────────────────────────────

/**
 * Returns the currently authenticated user profile.
 * Enabled only when an access token exists in sessionStorage.
 */
export function useMe() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: authApi.me,
    enabled: typeof window !== 'undefined' && !!tokenStore.get(),
    staleTime: 5 * 60_000, // 5 minutes — profile changes rarely
  })
}

// ── Login ─────────────────────────────────────────────────────────────────────

export function useLogin() {
  const router = useRouter()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
    onSuccess: (data) => {
      tokenStore.set(data.accessToken)
      queryClient.setQueryData(authKeys.me, data.user)
      toast.success(`Welcome back, ${data.user.name}!`)
      router.push('/dashboard')
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Login failed'
      toast.error(message)
    },
  })
}

// ── Register ──────────────────────────────────────────────────────────────────

export function useRegister() {
  const router = useRouter()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: RegisterPayload) => authApi.register(payload),
    onSuccess: (data) => {
      tokenStore.set(data.accessToken)
      queryClient.setQueryData(authKeys.me, data.user)
      toast.success('Account created! Welcome to MaintainHub.')
      router.push('/dashboard')
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Registration failed'
      toast.error(message)
    },
  })
}

// ── Logout ────────────────────────────────────────────────────────────────────

export function useLogout() {
  const router = useRouter()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      // Always clear local state even if the API call fails
      tokenStore.clear()
      queryClient.clear()
      router.push('/login')
    },
  })
}

// ── Forgot password ───────────────────────────────────────────────────────────

export function useForgotPassword() {
  return useMutation({
    mutationFn: ({ email, tenantSlug }: { email: string; tenantSlug: string }) =>
      authApi.forgotPassword(email, tenantSlug),
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Request failed'
      toast.error(message)
    },
  })
}

// ── Reset password ────────────────────────────────────────────────────────────

export function useResetPassword() {
  const router = useRouter()

  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      authApi.resetPassword(token, password),
    onSuccess: () => {
      toast.success('Password updated. Please log in.')
      router.push('/login')
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Reset failed'
      toast.error(message)
    },
  })
}
