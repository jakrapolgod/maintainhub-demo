import { MaintenanceReportPage } from '@/components/reports/MaintenanceReportPage'

export default function DowntimeReportPage() {
  return (
    <MaintenanceReportPage
      reportType="DOWNTIME"
      title="การวิเคราะห์เวลาหยุดทำงาน"
      description="MTBF/MTTR จากใบสั่งงานแก้ไขที่เสร็จสิ้น, สินทรัพย์หยุดทำงานสูงสุด 10 อันดับ และการวิเคราะห์สาเหตุรากเหง้า"
    />
  )
}
