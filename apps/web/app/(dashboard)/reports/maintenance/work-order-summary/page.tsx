import { MaintenanceReportPage } from '@/components/reports/MaintenanceReportPage'

export default function WorkOrderSummaryReportPage() {
  return (
    <MaintenanceReportPage
      reportType="WORK_ORDER_SUMMARY"
      title="สรุปใบสั่งงาน"
      description="จำนวนใบสั่งงานแบ่งตามประเภท/สถานะ/ลำดับความสำคัญ, การปฏิบัติตาม SLA, ความล้มเหลวซ้ำ และภาระงานช่างเทคนิค"
    />
  )
}
