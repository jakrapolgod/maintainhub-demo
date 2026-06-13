import { MaintenanceReportPage } from '@/components/reports/MaintenanceReportPage'

export default function PTWSummaryReportPage() {
  return (
    <MaintenanceReportPage
      reportType="PTW_SUMMARY"
      title="Permit-to-Work Summary Report"
      description="Permit-to-work activity, approval times, and safety summary for the selected period."
    />
  )
}
