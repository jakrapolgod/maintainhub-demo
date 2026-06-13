import { MaintenanceReportPage } from '@/components/reports/MaintenanceReportPage'

export default function WorkOrderSummaryReportPage() {
  return (
    <MaintenanceReportPage
      reportType="WORK_ORDER_SUMMARY"
      title="Work Order Summary Report"
      description="Work order counts by type/status/priority, SLA compliance, repeat failures, and technician workload."
    />
  )
}
