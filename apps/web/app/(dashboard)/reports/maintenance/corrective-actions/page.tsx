import { MaintenanceReportPage } from '@/components/reports/MaintenanceReportPage'

export default function CorrectiveActionsReportPage() {
  return (
    <MaintenanceReportPage
      reportType="CORRECTIVE_ACTIONS"
      title="มาตรการแก้ไข"
      description="ทะเบียนใบสั่งงานแก้ไขแบบ NCR พร้อมบันทึกสาเหตุรากเหง้าและการดำเนินการแก้ไข"
    />
  )
}
