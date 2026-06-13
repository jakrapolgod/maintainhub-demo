import { MaintenanceReportPage } from '@/components/reports/MaintenanceReportPage'

export default function DowntimeReportPage() {
  return (
    <MaintenanceReportPage
      reportType="DOWNTIME"
      title="Downtime & Reliability Report"
      description="MTBF/MTTR from completed corrective work orders, top-10 downtime assets, and root-cause breakdown."
    />
  )
}
