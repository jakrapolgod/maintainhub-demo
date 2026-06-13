/**
 * TanStack Query hooks for the analytics page.
 *
 * All analytics endpoints are cached server-side in Redis for 5 minutes, so
 * the client staleTime matches — refetching sooner would only re-read the
 * server cache.
 */
'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getAssetReliability,
  getCostBreakdown,
  getPMCompliance,
  type DateRangeFilters,
  type AssetReliabilityResult,
  type CostBreakdownResult,
  type PMComplianceResult,
} from '@/lib/api/analytics'
import { getWorkOrderMetrics, type WorkOrderMetrics } from '@/lib/api/work-orders'

const STALE_TIME_MS = 5 * 60_000 // matches the server-side Redis TTL

// ── Query key factory ─────────────────────────────────────────────────────────

export const analyticsKeys = {
  all: ['analytics'] as const,
  reliability: (f: DateRangeFilters) => [...analyticsKeys.all, 'reliability', f] as const,
  costs: (f: DateRangeFilters) => [...analyticsKeys.all, 'costs', f] as const,
  pmCompliance: () => [...analyticsKeys.all, 'pm-compliance'] as const,
  metrics: (f: DateRangeFilters) => [...analyticsKeys.all, 'metrics', f] as const,
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useAssetReliability(filters: DateRangeFilters = {}) {
  return useQuery<AssetReliabilityResult>({
    queryKey: analyticsKeys.reliability(filters),
    queryFn: () => getAssetReliability(filters),
    staleTime: STALE_TIME_MS,
  })
}

export function useCostBreakdown(filters: DateRangeFilters = {}) {
  return useQuery<CostBreakdownResult>({
    queryKey: analyticsKeys.costs(filters),
    queryFn: () => getCostBreakdown(filters),
    staleTime: STALE_TIME_MS,
  })
}

export function usePMCompliance() {
  return useQuery<PMComplianceResult>({
    queryKey: analyticsKeys.pmCompliance(),
    queryFn: getPMCompliance,
    staleTime: STALE_TIME_MS,
  })
}

export function useAnalyticsMetrics(filters: DateRangeFilters = {}) {
  return useQuery<WorkOrderMetrics>({
    queryKey: analyticsKeys.metrics(filters),
    queryFn: () => getWorkOrderMetrics(filters),
    staleTime: STALE_TIME_MS,
  })
}
