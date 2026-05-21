'use client'

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  listAssets,
  getAsset,
  getAssetTree,
  searchAssets,
  getAssetsAttention,
  createAsset,
  updateAsset,
  changeAssetStatus,
  decommissionAsset,
  transferAsset,
  deleteAsset,
  getAssetMetrics,
  listAssetWorkOrders,
  listAssetPMSchedules,
  listAssetDocuments,
  deleteAssetDocument,
  uploadAssetDocument,
  listCategories,
  listLocations,
} from '@/lib/api/assets'
import type {
  ListAssetsFilters,
  CreateAssetPayload,
  UpdateAssetPayload,
  ChangeStatusPayload,
  TransferAssetPayload,
} from '@/lib/api/assets'

// ── Query key factory ─────────────────────────────────────────────────────────

export const assetKeys = {
  all: ['assets'] as const,
  lists: () => [...assetKeys.all, 'list'] as const,
  list: (f: ListAssetsFilters) => [...assetKeys.lists(), f] as const,
  details: () => [...assetKeys.all, 'detail'] as const,
  detail: (id: string) => [...assetKeys.details(), id] as const,
  tree: (root?: string) => [...assetKeys.all, 'tree', root ?? 'root'] as const,
  search: (q: string) => [...assetKeys.all, 'search', q] as const,
  attention: () => [...assetKeys.all, 'attention'] as const,
  metrics: (id: string) => [...assetKeys.detail(id), 'metrics'] as const,
  workOrders: (id: string) => [...assetKeys.detail(id), 'work-orders'] as const,
  pmSchedules: (id: string) => [...assetKeys.detail(id), 'pm-schedules'] as const,
  documents: (id: string) => [...assetKeys.detail(id), 'documents'] as const,
  categories: () => [...assetKeys.all, 'categories'] as const,
  locations: () => [...assetKeys.all, 'locations'] as const,
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export function useAssets(filters: ListAssetsFilters = {}) {
  return useQuery({
    queryKey: assetKeys.list(filters),
    queryFn: () => listAssets(filters),
    staleTime: 30_000,
  })
}

export function useAsset(id: string | null | undefined) {
  return useQuery({
    queryKey: assetKeys.detail(id ?? ''),
    queryFn: () => getAsset(id!),
    enabled: !!id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

export function useAssetTree(rootAssetId?: string) {
  return useQuery({
    queryKey: assetKeys.tree(rootAssetId),
    queryFn: () => getAssetTree(rootAssetId),
    staleTime: 60_000,
  })
}

export function useAssetSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: assetKeys.search(q),
    queryFn: () => searchAssets(q),
    enabled: enabled && q.trim().length > 0,
    staleTime: 10_000,
  })
}

export function useAssetsAttention() {
  return useQuery({
    queryKey: assetKeys.attention(),
    queryFn: getAssetsAttention,
    staleTime: 60_000,
  })
}

export function useAssetMetrics(id: string | null | undefined) {
  return useQuery({
    queryKey: assetKeys.metrics(id ?? ''),
    queryFn: () => getAssetMetrics(id!),
    enabled: !!id,
    staleTime: 300_000,
  })
}

export function useAssetWorkOrders(id: string | null | undefined) {
  return useQuery({
    queryKey: assetKeys.workOrders(id ?? ''),
    queryFn: () => listAssetWorkOrders(id!),
    enabled: !!id,
    staleTime: 30_000,
  })
}

export function useAssetPMSchedules(id: string | null | undefined) {
  return useQuery({
    queryKey: assetKeys.pmSchedules(id ?? ''),
    queryFn: () => listAssetPMSchedules(id!),
    enabled: !!id,
    staleTime: 60_000,
  })
}

export function useAssetDocuments(id: string | null | undefined) {
  return useQuery({
    queryKey: assetKeys.documents(id ?? ''),
    queryFn: () => listAssetDocuments(id!),
    enabled: !!id,
    staleTime: 30_000,
  })
}

export function useCategories() {
  return useQuery({
    queryKey: assetKeys.categories(),
    queryFn: listCategories,
    staleTime: 300_000,
  })
}

export function useLocations() {
  return useQuery({
    queryKey: assetKeys.locations(),
    queryFn: listLocations,
    staleTime: 300_000,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateAssetPayload) => createAsset(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: assetKeys.lists() })
      void qc.invalidateQueries({ queryKey: assetKeys.tree() })
      toast.success('Asset created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateAsset(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateAssetPayload) => updateAsset(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: assetKeys.detail(id) })
      void qc.invalidateQueries({ queryKey: assetKeys.lists() })
      toast.success('Asset updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useChangeAssetStatus(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ChangeStatusPayload) => changeAssetStatus(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: assetKeys.detail(id) })
      void qc.invalidateQueries({ queryKey: assetKeys.lists() })
      void qc.invalidateQueries({ queryKey: assetKeys.tree() })
      toast.success('Status updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDecommissionAsset(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { reason: string }) => decommissionAsset(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: assetKeys.detail(id) })
      void qc.invalidateQueries({ queryKey: assetKeys.lists() })
      void qc.invalidateQueries({ queryKey: assetKeys.tree() })
      toast.success('Asset decommissioned')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useTransferAsset(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TransferAssetPayload) => transferAsset(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: assetKeys.detail(id) })
      void qc.invalidateQueries({ queryKey: assetKeys.lists() })
      void qc.invalidateQueries({ queryKey: assetKeys.tree() })
      toast.success('Asset transferred')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => deleteAsset(id, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: assetKeys.lists() })
      void qc.invalidateQueries({ queryKey: assetKeys.tree() })
      toast.success('Asset deleted')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUploadAssetDocument(assetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadAssetDocument(assetId, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: assetKeys.documents(assetId) })
      toast.success('Document uploaded')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteAssetDocument(assetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (docId: string) => deleteAssetDocument(assetId, docId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: assetKeys.documents(assetId) })
      toast.success('Document deleted')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
