import type { PMSchedule, WorkOrderDraft } from '@maintainhub/domain'

/** Minimal PM schedule row returned from the repository (already domain objects). */
export type PMScheduleRow = PMSchedule

/** Result shape returned by the PM scheduler processor. */
export interface PMSchedulerResult {
  tenantsChecked: number
  scheduled: number
  triggered: number
  failures: number
  noticesSent: number
}

/** Minimal logger interface (compatible with pino, console, and test stubs). */
export interface PMSchedulerLogger {
  info(data: object | string, msg?: string): void
  warn(data: object | string, msg?: string): void
  error(data: object | string, msg?: string): void
}

/** Port for creating work orders from within the worker context. */
export interface WorkOrderCreator {
  createFromPMDraft(draft: WorkOrderDraft, tenantId: string): Promise<string>
}

/** Port for publishing advance-notice notifications. */
export interface NotificationPublisher {
  publishAdvanceNotice(opts: {
    scheduleId: string
    tenantId: string
    assetId: string
    title: string
    nextDueAt: Date
    assigneeIds: string[]
  }): Promise<void>

  publishJobFailed(opts: { jobName: string; errorMsg: string; timestamp: Date }): Promise<void>
}
