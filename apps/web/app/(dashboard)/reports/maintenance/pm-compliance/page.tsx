import { MaintenanceReportPage } from '@/components/reports/MaintenanceReportPage'

export default function PMCompliancePage() {
  return (
    <MaintenanceReportPage
      reportType="PM_COMPLIANCE"
      title="อัตราการบำรุงรักษา"
      description="การบำรุงรักษาเชิงป้องกันที่วางแผนไว้เทียบกับที่ดำเนินการจริง พร้อมรายการที่เกินกำหนดและเป้าหมายการปฏิบัติตาม 95%"
    />
  )
}
