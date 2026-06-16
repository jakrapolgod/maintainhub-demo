import { MaintenanceReportPage } from '@/components/reports/MaintenanceReportPage'

export default function PTWSummaryReportPage() {
  return (
    <MaintenanceReportPage
      reportType="PTW_SUMMARY"
      title="ใบอนุญาตความปลอดภัย"
      description="กิจกรรมใบอนุญาตทำงาน เวลาอนุมัติ และสรุปความปลอดภัยในช่วงที่เลือก"
    />
  )
}
