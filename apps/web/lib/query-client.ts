import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Consider data stale after 60 seconds — avoids refetching on every focus
        staleTime: 60_000,
        // Don't retry auth errors (401/403) — just surface them to the UI
        retry: (failureCount, error) => {
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            return false
          }
          return failureCount < 2
        },
      },
    },
  })
}
