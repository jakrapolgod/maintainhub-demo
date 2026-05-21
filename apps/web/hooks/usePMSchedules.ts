'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  listPMSchedules,
  getPMSchedule,
  createPMSchedule,
  updatePMSchedule,
  deletePMSchedule,
  activatePMSchedule,
  deactivatePMSchedule,
  triggerPMSchedule,
  clonePMSchedule,
  getPMCalendar,
  getUpcomingPM,
  getPMCompliance,
  suggestPMSchedules,
} from '@/lib/api/pm-schedules'
import type {
  ListPMSchedulesFilters,
  CreatePMSchedulePayload,
  UpdatePMSchedulePayload,
} from '@/lib/api/pm-schedules'

// ── Query key factory ─────────────────────────────────────────────────────────

export const pmKeys = {
  all: ['pm-schedules'] as const,
  lists: () => [...pmKeys.all, 'list'] as const,
  list: (f: ListPMSchedulesFilters) => [...pmKeys.lists(), f] as const,
  details: () => [...pmKeys.all, 'detail'] as const,
  detail: (id: string) => [...pmKeys.details(), id] as const,
  calendar: (from: string, to: string) => [...pmKeys.all, 'calendar', from, to] as const,
  upcoming: (days: number) => [...pmKeys.all, 'upcoming', days] as const,
  compliance: (months: number) => [...pmKeys.all, 'compliance', months] as const,
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export function usePMSchedules(filters: ListPMSchedulesFilters = {}) {
  return useQuery({
    queryKey: pmKeys.list(filters),
    queryFn: () => listPMSchedules(filters),
    staleTime: 30_000,
  })
}

export function usePMSchedule(id: string | null | undefined) {
  return useQuery({
    queryKey: pmKeys.detail(id ?? ''),
    queryFn: () => getPMSchedule(id!),
    enabled: !!id,
    staleTime: 30_000,
  })
}

export function usePMCalendar(from: string, to: string) {
  return useQuery({
    queryKey: pmKeys.calendar(from, to),
    queryFn: () => getPMCalendar(from, to),
    staleTime: 60_000,
    enabled: !!(from && to),
  })
}

export function useUpcomingPM(days: 30 | 60 | 90 = 30) {
  return useQuery({
    queryKey: pmKeys.upcoming(days),
    queryFn: () => getUpcomingPM(days),
    staleTime: 60_000,
  })
}

export function usePMCompliance(lookbackMonths = 12) {
  return useQuery({
    queryKey: pmKeys.compliance(lookbackMonths),
    queryFn: () => getPMCompliance(lookbackMonths),
    staleTime: 300_000,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreatePMSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createPMSchedule,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pmKeys.lists() })
      toast.success('PM schedule created')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdatePMSchedule(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdatePMSchedulePayload) => updatePMSchedule(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pmKeys.detail(id) })
      void qc.invalidateQueries({ queryKey: pmKeys.lists() })
      toast.success('PM schedule updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeletePMSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePMSchedule(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pmKeys.lists() })
      toast.success('PM schedule deactivated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useActivatePMSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => activatePMSchedule(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pmKeys.all })
      toast.success('PM schedule activated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeactivatePMSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deactivatePMSchedule(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pmKeys.all })
      toast.success('PM schedule deactivated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useTriggerPMSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, assigneeIds }: { id: string; assigneeIds?: string[] }) =>
      triggerPMSchedule(id, assigneeIds),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: pmKeys.all })
      toast.success(`Work order ${data.woNumber} created`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useClonePMSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      targetAssetId,
      title,
    }: {
      id: string
      targetAssetId: string
      title?: string
    }) => clonePMSchedule(id, targetAssetId, title),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pmKeys.lists() })
      toast.success('PM schedule cloned')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useSuggestPMSchedules() {
  return useMutation({
    mutationFn: ({
      assetType,
      manufacturer,
      model,
    }: {
      assetType: string
      manufacturer?: string
      model?: string
    }) => suggestPMSchedules(assetType, manufacturer, model),
    onError: (err: Error) => toast.error(`AI suggestion failed: ${err.message}`),
  })
}
