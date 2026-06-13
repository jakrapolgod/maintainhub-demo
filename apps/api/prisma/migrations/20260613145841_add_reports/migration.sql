-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('PM_COMPLIANCE', 'DOWNTIME', 'WORK_ORDER_SUMMARY', 'CORRECTIVE_ACTIONS', 'PTW_SUMMARY');

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "docNumber" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "siteId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "pdfKey" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_tenantId_reportType_createdAt_idx" ON "Report"("tenantId", "reportType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_tenantId_docNumber_key" ON "Report"("tenantId", "docNumber");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

