/**
 * Typed API client for maintenance report generation endpoints.
 * Backs the /reports/maintenance/* pages.
 */
import { apiFetch } from '@/lib/api'

export type MaintenanceReportType =
  | 'PM_COMPLIANCE'
  | 'DOWNTIME'
  | 'WORK_ORDER_SUMMARY'
  | 'CORRECTIVE_ACTIONS'
  | 'PTW_SUMMARY'

export interface GenerateReportPayload {
  periodFrom: string
  periodTo: string
  siteId?: string
}

export interface GenerateReportResult {
  id: string
  docNumber: string
  pdfUrl: string
}

export interface ReportHistoryItem {
  id: string
  reportType: MaintenanceReportType
  docNumber: string
  periodFrom: string
  periodTo: string
  siteId: string | null
  createdAt: string
  generatedBy: string
  pdfUrl: string
}

export interface SiteStub {
  id: string
  code: string
  name: string
}

const ENDPOINTS: Record<MaintenanceReportType, string> = {
  PM_COMPLIANCE: 'pm-compliance',
  DOWNTIME: 'downtime',
  WORK_ORDER_SUMMARY: 'work-order-summary',
  CORRECTIVE_ACTIONS: 'corrective-actions',
  PTW_SUMMARY: 'ptw-summary',
}

export function generateMaintenanceReport(
  type: MaintenanceReportType,
  payload: GenerateReportPayload,
): Promise<GenerateReportResult> {
  return apiFetch<GenerateReportResult>(
    `/reports/maintenance/${ENDPOINTS[type]}/generate`,
    'POST',
    payload,
  )
}

export function listMaintenanceReports(
  type: MaintenanceReportType,
): Promise<{ reports: ReportHistoryItem[] }> {
  return apiFetch<{ reports: ReportHistoryItem[] }>(`/reports/maintenance?reportType=${type}`)
}

export function listSites(): Promise<SiteStub[]> {
  return apiFetch<{ sites: SiteStub[] }>('/sites')
    .then((res) => res.sites)
    .catch(() => [])
}
