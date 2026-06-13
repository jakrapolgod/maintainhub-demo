import { MaintenanceReportPage } from '@/components/reports/MaintenanceReportPage'

export default function CorrectiveActionsReportPage() {
  return (
    <MaintenanceReportPage
      reportType="CORRECTIVE_ACTIONS"
      title="Corrective Actions Report"
      description="NCR-style register of corrective work orders with root cause and action-taken records."
    />
  )
}
