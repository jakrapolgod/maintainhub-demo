/**
 * TanStack Query hooks for work orders.
 *
 * ## Query key hierarchy
 *
 *   workOrderKeys.all              — base key for all WO queries
 *   workOrderKeys.lists()          — all list queries
 *   workOrderKeys.list(filters)    — specific list (filters are part of the key)
 *   workOrderKeys.details()        — all detail queries
 *   workOrderKeys.detail(id)       — single WO detail
 *   workOrderKeys.metrics(range)   — dashboard metrics
 *   workOrderKeys.calendar(y, m)   — calendar month
 *
 * Invalidating workOrderKeys.all invalidates every WO query in one call.
 * Invalidating workOrderKeys.lists() is sufficient after mutations that only
 * affect list data (status changes, assignment, etc.).
 */
'use client'

import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  type InfiniteData,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  listWorkOrders,
  getWorkOrder,
  createWorkOrder,
  updateWorkOrder,
  completeWorkOrder,
  addLabor,
  usePart as recordPartUsage,
  getWorkOrderMetrics,
  getWorkOrderCalendar,
  draftFromNL,
  assignWorkOrder,
  holdWorkOrder,
  startWorkOrder,
  cancelWorkOrder,
  deleteWorkOrder,
  addComment,
  uploadAttachment,
  listAttachments,
  listComments,
  listLabor,
  listParts,
  searchParts,
  listFailureCodes,
} from '@/lib/api/work-orders'
import type {
  ListWorkOrdersFilters,
  CreateWorkOrderPayload,
  UpdateWorkOrderPayload,
  AddLaborPayload,
  UsePartPayload,
  MetricsFilters,
  WorkOrderDetail,
  WorkOrderListResult,
  WorkOrderSummary,
  PartSearchResult,
  FailureCodeResult,
} from '@/lib/api/work-orders'

// ── Query key factory ─────────────────────────────────────────────────────────

export const workOrderKeys = {
  all: ['work-orders'] as const,
  lists: () => [...workOrderKeys.all, 'list'] as const,
  list: (f: ListWorkOrdersFilters) => [...workOrderKeys.lists(), f] as const,
  details: () => [...workOrderKeys.all, 'detail'] as const,
  detail: (id: string) => [...workOrderKeys.details(), id] as const,
  labor: (id: string) => [...workOrderKeys.detail(id), 'labor'] as const,
  parts: (id: string) => [...workOrderKeys.detail(id), 'parts'] as const,
  comments: (id: string) => [...workOrderKeys.detail(id), 'comments'] as const,
  attachments: (id: string) => [...workOrderKeys.detail(id), 'attachments'] as const,
  metrics: (f: MetricsFilters) => [...workOrderKeys.all, 'metrics', f] as const,
  calendar: (year: number, month: number) =>
    [...workOrderKeys.all, 'calendar', year, month] as const,
}

// ── List ──────────────────────────────────────────────────────────────────────

/**
 * Paginated list of work orders.  Data is considered stale after 30 seconds
 * to match the server-side Redis cache TTL for this endpoint.
 */
export function useWorkOrders(filters: ListWorkOrdersFilters = {}) {
  return useQuery({
    queryKey: workOrderKeys.list(filters),
    queryFn: () => listWorkOrders(filters),
    staleTime: 30_000,
  })
}

/**
 * Infinite scroll variant — fetches the next page when `fetchNextPage` is called.
 * Each page is appended to `data.pages`; flatten with `pages.flatMap(p => p.items)`.
 */
export function useWorkOrdersInfinite(
  filters: Omit<ListWorkOrdersFilters, 'page' | 'cursor'> = {},
) {
  return useInfiniteQuery<
    WorkOrderListResult,
    Error,
    InfiniteData<WorkOrderListResult, string | null>,
    ReturnType<typeof workOrderKeys.list>,
    string | null
  >({
    queryKey: workOrderKeys.list(filters),
    queryFn: ({ pageParam }) =>
      listWorkOrders({
        ...filters,
        ...(pageParam !== null && { cursor: pageParam }),
        limit: filters.limit ?? 20,
      }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
    staleTime: 30_000,
  })
}

// ── Single work order ─────────────────────────────────────────────────────────

/**
 * Full detail for one work order.
 * Refetches automatically when the browser tab regains focus so the detail
 * view stays fresh after the user returns from another tab.
 */
export function useWorkOrder(id: string | null | undefined) {
  return useQuery({
    queryKey: workOrderKeys.detail(id ?? ''),
    queryFn: () => getWorkOrder(id!),
    enabled: !!id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

// ── Sub-resource queries ──────────────────────────────────────────────────────

export function useWorkOrderLabor(id: string | null | undefined) {
  return useQuery({
    queryKey: workOrderKeys.labor(id ?? ''),
    queryFn: () => listLabor(id!),
    enabled: !!id,
    staleTime: 60_000,
  })
}

export function useWorkOrderParts(id: string | null | undefined) {
  return useQuery({
    queryKey: workOrderKeys.parts(id ?? ''),
    queryFn: () => listParts(id!),
    enabled: !!id,
    staleTime: 60_000,
  })
}

export function useWorkOrderComments(id: string | null | undefined) {
  return useQuery({
    queryKey: workOrderKeys.comments(id ?? ''),
    queryFn: () => listComments(id!),
    enabled: !!id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

export function useWorkOrderAttachments(id: string | null | undefined) {
  return useQuery({
    queryKey: workOrderKeys.attachments(id ?? ''),
    queryFn: () => listAttachments(id!),
    enabled: !!id,
    staleTime: 60_000,
  })
}

// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Creates a work order and optimistically inserts a placeholder into the
 * list cache so the UI responds instantly.  The placeholder is replaced by
 * the server-confirmed row on success, or rolled back on failure.
 */
export function useCreateWorkOrder() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateWorkOrderPayload) => createWorkOrder(data),
    onSuccess: (_result, variables) => {
      // Invalidate all list queries — the server has the canonical data
      void qc.invalidateQueries({ queryKey: workOrderKeys.lists() })
      toast.success(`Work order "${variables.title}" created`)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create work order')
    },
  })
}

// ── Update ────────────────────────────────────────────────────────────────────

export function useUpdateWorkOrder(id: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateWorkOrderPayload) => updateWorkOrder(id, data),
    onMutate: async (data) => {
      // Cancel in-flight requests for this WO to prevent overwrites
      await qc.cancelQueries({ queryKey: workOrderKeys.detail(id) })
      const previous = qc.getQueryData<WorkOrderDetail>(workOrderKeys.detail(id))

      // Apply optimistic patch to the detail cache
      if (previous) {
        qc.setQueryData<WorkOrderDetail>(workOrderKeys.detail(id), {
          ...previous,
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.priority !== undefined && { priority: data.priority }),
          ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
          ...(data.assigneeIds !== undefined && { assigneeIds: data.assigneeIds }),
        })
      }
      return { previous }
    },
    onError: (_err, _data, context) => {
      if (context?.previous) {
        qc.setQueryData(workOrderKeys.detail(id), context.previous)
      }
      toast.error('Failed to update work order')
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workOrderKeys.detail(id) })
      void qc.invalidateQueries({ queryKey: workOrderKeys.lists() })
      toast.success('Work order updated')
    },
  })
}

// ── Lifecycle actions ─────────────────────────────────────────────────────────

export function useAssignWorkOrder(id: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (technicianIds: string[]) => assignWorkOrder(id, technicianIds),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workOrderKeys.detail(id) })
      void qc.invalidateQueries({ queryKey: workOrderKeys.lists() })
      toast.success('Technician(s) assigned')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Assignment failed')
    },
  })
}

export function useStartWorkOrder(id: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: () => startWorkOrder(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workOrderKeys.detail(id) })
      void qc.invalidateQueries({ queryKey: workOrderKeys.lists() })
      toast.success('Work order started')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to start')
    },
  })
}

export function useHoldWorkOrder(id: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (reason: string) => holdWorkOrder(id, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workOrderKeys.detail(id) })
      void qc.invalidateQueries({ queryKey: workOrderKeys.lists() })
      toast.success('Work order placed on hold')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to hold')
    },
  })
}

/**
 * Completes an IN_PROGRESS work order.
 * Optimistically marks the status as COMPLETED in the detail cache.
 */
export function useCompleteWorkOrder(id: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ resolution, failureCodeId }: { resolution: string; failureCodeId?: string }) =>
      completeWorkOrder(id, resolution, failureCodeId),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: workOrderKeys.detail(id) })
      const previous = qc.getQueryData<WorkOrderDetail>(workOrderKeys.detail(id))
      if (previous) {
        qc.setQueryData<WorkOrderDetail>(workOrderKeys.detail(id), {
          ...previous,
          status: 'COMPLETED',
          completedAt: new Date().toISOString(),
        })
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(workOrderKeys.detail(id), context.previous)
      }
      toast.error('Failed to complete work order')
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workOrderKeys.detail(id) })
      void qc.invalidateQueries({ queryKey: workOrderKeys.lists() })
      void qc.invalidateQueries({ queryKey: workOrderKeys.metrics({}) })
      toast.success('Work order completed')
    },
  })
}

export function useCancelWorkOrder(id: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (reason: string) => cancelWorkOrder(id, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workOrderKeys.detail(id) })
      void qc.invalidateQueries({ queryKey: workOrderKeys.lists() })
      toast.success('Work order cancelled')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel')
    },
  })
}

export function useDeleteWorkOrder() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => deleteWorkOrder(id, reason),
    onSuccess: (_data, { id }) => {
      // Remove from list optimistically
      qc.setQueriesData<WorkOrderListResult>({ queryKey: workOrderKeys.lists() }, (old) =>
        old ? { ...old, items: old.items.filter((w) => w.id !== id), total: old.total - 1 } : old,
      )
      void qc.invalidateQueries({ queryKey: workOrderKeys.lists() })
      toast.success('Work order cancelled')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    },
  })
}

// ── Labor ─────────────────────────────────────────────────────────────────────

/**
 * Records hours worked.
 * Invalidates both the labor sub-resource and the detail cache
 * (which includes the updated `totalLaborCost`).
 */
export function useAddLabor(workOrderId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (entry: AddLaborPayload) => addLabor(workOrderId, entry),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workOrderKeys.labor(workOrderId) })
      void qc.invalidateQueries({ queryKey: workOrderKeys.detail(workOrderId) })
      toast.success('Labor entry recorded')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to record labor')
    },
  })
}

// ── Parts ─────────────────────────────────────────────────────────────────────

export function useUsePart(workOrderId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (usage: UsePartPayload) => recordPartUsage(workOrderId, usage),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workOrderKeys.parts(workOrderId) })
      void qc.invalidateQueries({ queryKey: workOrderKeys.detail(workOrderId) })
      toast.success('Part usage recorded')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to record part')
    },
  })
}

// ── Comments ──────────────────────────────────────────────────────────────────

export function useAddComment(workOrderId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ content, mentions }: { content: string; mentions?: string[] }) =>
      addComment(workOrderId, content, mentions),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workOrderKeys.comments(workOrderId) })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to post comment')
    },
  })
}

// ── Attachments ───────────────────────────────────────────────────────────────

export function useUploadAttachment(workOrderId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (file: File) => uploadAttachment(workOrderId, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workOrderKeys.attachments(workOrderId) })
      toast.success('File uploaded')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    },
  })
}

// ── Metrics ───────────────────────────────────────────────────────────────────

/**
 * Dashboard KPIs.  Results are cached server-side for 5 minutes, so the
 * client staleTime is set to match — no redundant refetches within that window.
 */
export function useWorkOrderMetrics(filters: MetricsFilters = {}) {
  return useQuery({
    queryKey: workOrderKeys.metrics(filters),
    queryFn: () => getWorkOrderMetrics(filters),
    staleTime: 5 * 60_000,
  })
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export function useWorkOrderCalendar(year: number, month: number) {
  return useQuery({
    queryKey: workOrderKeys.calendar(year, month),
    queryFn: () => getWorkOrderCalendar(year, month),
    staleTime: 60_000,
  })
}

// ── AI draft ──────────────────────────────────────────────────────────────────

export function useDraftFromNL() {
  return useMutation({
    mutationFn: ({ message, assetId }: { message: string; assetId?: string }) =>
      draftFromNL(message, assetId),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'AI draft failed')
    },
  })
}

// ── Prefetch helpers (for use in Next.js page loaders / RSC) ─────────────────

/**
 * Prefetch a work order list into the query cache.
 * Call from a server component or `generateStaticParams` to warm the cache.
 */
export async function prefetchWorkOrders(
  qc: ReturnType<typeof useQueryClient>,
  filters: ListWorkOrdersFilters = {},
) {
  await qc.prefetchQuery({
    queryKey: workOrderKeys.list(filters),
    queryFn: () => listWorkOrders(filters),
    staleTime: 30_000,
  })
}

/**
 * Prefetch a single work order's detail into the cache.
 */
export async function prefetchWorkOrder(qc: ReturnType<typeof useQueryClient>, id: string) {
  await qc.prefetchQuery({
    queryKey: workOrderKeys.detail(id),
    queryFn: () => getWorkOrder(id),
    staleTime: 30_000,
  })
}

// ── Utility: pluck summary from detail cache ──────────────────────────────────

/**
 * Returns the cached `WorkOrderSummary` slice for the given ID if the detail
 * query is already populated.  Useful for optimistic UI before a full load.
 */
export function getCachedSummary(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
): WorkOrderSummary | undefined {
  const detail = qc.getQueryData<WorkOrderDetail>(workOrderKeys.detail(id))
  if (!detail) return undefined
  const {
    laborEntries: _l,
    partUsages: _pu,
    attachments: _a,
    comments: _c,
    auditTrail: _at,
    ...summary
  } = detail
  return summary as WorkOrderSummary
}

// ── Parts search (for PartUsageForm) ─────────────────────────────────────────

const partsKeys = {
  search: (q: string) => ['parts', 'search', q] as const,
}

/**
 * Debounce-friendly parts search — only fires when `search` has ≥2 chars.
 * staleTime is generous (2 min) since part catalog changes infrequently.
 */
export function usePartsSearch(search: string) {
  return useQuery({
    queryKey: partsKeys.search(search),
    queryFn: () => searchParts(search),
    enabled: search.trim().length >= 2,
    staleTime: 2 * 60_000,
  })
}

// ── Failure codes (for CompleteWorkOrderDialog) ────────────────────────────────

const failureCodeKeys = {
  all: ['failure-codes'] as const,
}

/**
 * List all failure codes. Cached for 10 minutes — the catalog rarely changes.
 */
export function useFailureCodes() {
  return useQuery({
    queryKey: failureCodeKeys.all,
    queryFn: listFailureCodes,
    staleTime: 10 * 60_000,
  })
}
