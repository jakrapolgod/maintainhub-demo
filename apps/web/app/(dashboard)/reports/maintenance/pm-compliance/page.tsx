import { MaintenanceReportPage } from '@/components/reports/MaintenanceReportPage'

export default function PMCompliancePage() {
  return (
    <MaintenanceReportPage
      reportType="PM_COMPLIANCE"
      title="PM Compliance Report"
      description="Planned vs. completed preventive maintenance, with overdue schedules and a 95% compliance target."
    />
  )
}
