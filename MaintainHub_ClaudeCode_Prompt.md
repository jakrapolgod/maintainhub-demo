# MaintainHub — Claude Code Master Prompt

> AI-Powered Enterprise CMMS Platform | Full-Stack Build Specification
> Version 1.0 | Phase 1→3 Roadmap Implementation

---

## ภาพรวมโปรเจกต์

สร้าง **MaintainHub** ซึ่งเป็น Enterprise CMMS (Computerized Maintenance Management System)
ที่มี AI เป็น core ไม่ใช่ add-on เป้าหมายคือแทนที่ IBM Maximo / SAP PM ด้วย UX ที่ดีกว่า
และ deploy เร็วกว่า 10 เท่า

### เป้าหมายคะแนน (เทียบ Enterprise CMMS benchmark = 99/100)

| Dimension   | ปัจจุบัน | Phase 1 | Phase 2 | Phase 3 |
| ----------- | -------- | ------- | ------- | ------- |
| Work Orders | 65       | 80      | 92      | 99      |
| Asset Mgmt  | 55       | 75      | 90      | 99      |
| Preventive  | 50       | 72      | 88      | 99      |
| AI Features | 90       | 93      | 96      | 99      |
| Ease of Use | 92       | 95      | 97      | 99      |
| Integration | 30       | 55      | 80      | 99      |

---

## หลักการ Software Engineering ที่ต้องใช้ตลอดทั้งโปรเจกต์

### 1. Architecture Principles

```
ใช้ Clean Architecture แบ่ง layer ชัดเจน:

┌─────────────────────────────────────────┐
│  Presentation Layer (React/Next.js)     │
│  - UI Components, Pages, Layouts        │
├─────────────────────────────────────────┤
│  Application Layer (Use Cases)          │
│  - Business logic, Orchestration        │
│  - DTOs, Command/Query handlers         │
├─────────────────────────────────────────┤
│  Domain Layer (Core Business Rules)     │
│  - Entities, Value Objects              │
│  - Domain Events, Aggregates            │
│  - Repository Interfaces                │
├─────────────────────────────────────────┤
│  Infrastructure Layer                   │
│  - Database (PostgreSQL + Prisma)       │
│  - External APIs, Message Queue         │
│  - Repository Implementations           │
└─────────────────────────────────────────┘
```

### 2. SOLID Principles — enforce ทุก class/module

- **S**ingle Responsibility: แต่ละ module ทำงานเดียว
- **O**pen/Closed: extend ได้โดยไม่แก้ core
- **L**iskov Substitution: subtype ใช้แทน base ได้
- **I**nterface Segregation: interface เล็ก specific
- **D**ependency Inversion: depend on abstractions

### 3. Design Patterns ที่ต้องใช้

```typescript
// Repository Pattern — แยก data access ออกจาก business logic
interface WorkOrderRepository {
  findById(id: WorkOrderId): Promise<WorkOrder | null>
  findByAsset(assetId: AssetId): Promise<WorkOrder[]>
  save(workOrder: WorkOrder): Promise<void>
  delete(id: WorkOrderId): Promise<void>
}

// CQRS — แยก read/write path
// Command: CreateWorkOrderCommand, UpdateWorkOrderCommand
// Query: GetWorkOrderQuery, ListWorkOrdersQuery

// Domain Events — loose coupling ระหว่าง bounded contexts
class WorkOrderCompletedEvent {
  constructor(
    public readonly workOrderId: WorkOrderId,
    public readonly assetId: AssetId,
    public readonly completedAt: Date,
    public readonly technicianId: UserId,
  ) {}
}

// Factory Pattern — สร้าง complex objects
class WorkOrderFactory {
  static createPreventive(schedule: PMSchedule): WorkOrder { ... }
  static createCorrectiveFromAlert(alert: SensorAlert): WorkOrder { ... }
}
```

### 4. Testing Strategy — ทุก feature ต้องมี test

```
Unit Tests:     Domain logic, pure functions           → Jest
Integration:    API routes, DB queries                 → Jest + Testcontainers
E2E Tests:      Critical user flows                    → Playwright
Coverage:       ≥ 80% overall, ≥ 95% domain layer
```

### 5. API Design — RESTful + GraphQL Hybrid

```
REST:     CRUD operations, file uploads, webhooks
GraphQL:  Complex queries, real-time subscriptions
WebSocket: Live WO updates, sensor alerts, notifications
```

### 6. Security Requirements

```
Authentication:   JWT + Refresh Token (httpOnly cookie)
Authorization:    RBAC (Role-Based Access Control)
Multi-tenancy:    Row-Level Security (RLS) ใน PostgreSQL
API Security:     Rate limiting, Input validation (Zod)
Secrets:          ไม่มี hardcode — ใช้ env variables เสมอ
Audit Log:        ทุก mutation ต้อง log (who, what, when, from where)
```

---

## Tech Stack

### Backend

```yaml
Runtime: Node.js 20 LTS (TypeScript strict mode)
Framework: Fastify v4 (เร็วกว่า Express 2x)
ORM: Prisma v5 + PostgreSQL 16
Cache: Redis 7 (sessions, rate limit, pub/sub)
Queue: BullMQ (background jobs, PM scheduling)
AI: Anthropic SDK (claude-sonnet-4-20250514)
File Storage: MinIO (S3-compatible, self-hosted)
Search: Meilisearch (full-text, Thai language)
Realtime: Socket.io v4
Validation: Zod
Logging: Pino + structured JSON
Monitoring: OpenTelemetry → Grafana/Prometheus
```

### Frontend

```yaml
Framework: Next.js 15 (App Router, RSC)
Language: TypeScript strict
Styling: Tailwind CSS v4 + shadcn/ui
State: Zustand (client) + TanStack Query v5 (server)
Forms: React Hook Form + Zod resolver
Tables: TanStack Table v8
Charts: Recharts + D3.js (sensor data)
Maps: Mapbox GL JS (GIS features, Phase 3)
Realtime: Socket.io client
Mobile: PWA + Service Worker (offline-first)
Testing: Vitest + React Testing Library + Playwright
```

### Infrastructure

```yaml
Container: Docker + Docker Compose (dev)
  Kubernetes (production, Phase 2+)
CI/CD: GitHub Actions
IaC: Terraform (Phase 2+)
DB Backup: Automated daily → S3
CDN: Cloudflare
SSL: Let's Encrypt (auto-renew)
```

---

## โครงสร้าง Monorepo

```
maintainhub/
├── apps/
│   ├── web/                    # Next.js frontend
│   ├── api/                    # Fastify backend
│   └── worker/                 # BullMQ job processor
├── packages/
│   ├── domain/                 # Core business logic (shared)
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── events/
│   │   └── repositories/       # interfaces only
│   ├── shared/                 # Types, constants, utils
│   │   ├── types/
│   │   ├── constants/
│   │   └── utils/
│   └── ui/                     # Shared React components
├── infrastructure/
│   ├── docker/
│   ├── k8s/
│   └── terraform/
├── tests/
│   ├── e2e/                    # Playwright
│   └── fixtures/
├── docs/
│   ├── api/                    # OpenAPI spec
│   ├── adr/                    # Architecture Decision Records
│   └── runbooks/
├── .github/
│   └── workflows/
├── package.json                # pnpm workspaces
├── turbo.json                  # Turborepo
└── docker-compose.yml
```

---

## Domain Model (Core Entities)

### ออกแบบตาม Domain-Driven Design (DDD)

```typescript
// ============================================================
// BOUNDED CONTEXT: Work Order Management
// ============================================================

// Value Objects
class WorkOrderId { constructor(private readonly value: string) {} }
class Priority { /* LOW | MEDIUM | HIGH | CRITICAL */ }
class WorkOrderStatus { /* DRAFT | OPEN | IN_PROGRESS | ON_HOLD | COMPLETED | CANCELLED */ }
class LaborCost { constructor(private readonly hours: number, private readonly rate: Money) {} }

// Aggregate Root
class WorkOrder {
  private id: WorkOrderId
  private title: string
  private description: string
  private priority: Priority
  private status: WorkOrderStatus
  private assetId: AssetId
  private assignees: TechnicianId[]
  private laborEntries: LaborEntry[]
  private partUsages: PartUsage[]
  private attachments: Attachment[]
  private permitToWork?: PermitToWork
  private slaDeadline?: Date
  private parentWorkOrderId?: WorkOrderId  // สำหรับ sub-WO
  private failureCode?: FailureCode
  private domainEvents: DomainEvent[] = []

  // Business Rules ใน domain — ไม่ใน controller/service
  complete(technicianId: TechnicianId, resolution: string): void {
    if (this.status !== WorkOrderStatus.IN_PROGRESS) {
      throw new DomainException('Only in-progress WO can be completed')
    }
    if (this.permitToWork && !this.permitToWork.isSigned()) {
      throw new DomainException('PTW must be signed before completion')
    }
    this.status = WorkOrderStatus.COMPLETED
    this.domainEvents.push(new WorkOrderCompletedEvent(this.id, this.assetId, new Date(), technicianId))
  }

  assignTechnician(technicianId: TechnicianId, assignedBy: UserId): void { ... }
  addLabor(entry: LaborEntry): void { ... }
  usePart(part: PartUsage): void { ... }
  escalate(reason: string): void { ... }
}

// ============================================================
// BOUNDED CONTEXT: Asset Management
// ============================================================

class Asset {
  private id: AssetId
  private name: string
  private assetNumber: string              // unique per tenant
  private category: AssetCategory
  private parentAssetId?: AssetId          // hierarchy
  private location: Location
  private manufacturer: string
  private model: string
  private serialNumber: string
  private installDate: Date
  private warrantyExpiry?: Date
  private criticality: CriticalityLevel   // A, B, C, D
  private documents: Document[]
  private customFields: Map<string, unknown>
  private status: AssetStatus             // OPERATIONAL | STANDBY | UNDER_MAINTENANCE | DECOMMISSIONED

  calculateMTBF(workOrders: WorkOrder[]): Duration { ... }
  calculateMTTR(workOrders: WorkOrder[]): Duration { ... }
  isWarrantyExpired(): boolean { ... }
  getChildren(): AssetId[] { ... }        // direct children ใน hierarchy
}

// ============================================================
// BOUNDED CONTEXT: Preventive Maintenance
// ============================================================

class PMSchedule {
  private id: PMScheduleId
  private assetId: AssetId
  private title: string
  private triggerType: TriggerType        // CALENDAR | METER | CONDITION
  private calendarRule?: CalendarRule     // cron-like: "every 30 days"
  private meterRule?: MeterRule           // "every 250 hours runtime"
  private conditionRule?: ConditionRule   // "when vibration > threshold"
  private taskList: Task[]
  private estimatedDuration: Duration
  private requiredParts: RequiredPart[]
  private requiredSkills: Skill[]
  private isActive: boolean

  shouldTrigger(currentMeterReading: number, lastTriggered: Date): boolean { ... }
  generateWorkOrder(): WorkOrderDraft { ... }
}

// ============================================================
// BOUNDED CONTEXT: Inventory
// ============================================================

class Part {
  private id: PartId
  private partNumber: string
  private name: string
  private quantity: number
  private minimumStock: number
  private unitCost: Money
  private location: StoreLocation
  private suppliers: Supplier[]

  isLowStock(): boolean { return this.quantity <= this.minimumStock }
  reserve(qty: number): void { ... }     // สำหรับ WO ที่จะใช้
  replenish(qty: number): void { ... }
}
```

---

## Database Schema (Prisma)

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Multi-tenancy — ทุก table มี tenantId
model Tenant {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  plan        Plan     @default(STARTER)
  createdAt   DateTime @default(now())
  users       User[]
  assets      Asset[]
  workOrders  WorkOrder[]
  // ...
}

model User {
  id          String   @id @default(cuid())
  tenantId    String
  email       String
  name        String
  role        Role     // ADMIN | MANAGER | TECHNICIAN | VIEWER | CONTRACTOR
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  createdAt   DateTime @default(now())

  @@unique([tenantId, email])
  @@index([tenantId])
}

model Asset {
  id            String        @id @default(cuid())
  tenantId      String
  assetNumber   String
  name          String
  categoryId    String
  parentId      String?       // self-reference for hierarchy
  locationId    String
  criticality   Criticality   @default(C)
  status        AssetStatus   @default(OPERATIONAL)
  manufacturer  String?
  model         String?
  serialNumber  String?
  installDate   DateTime?
  warrantyExpiry DateTime?
  customFields  Json          @default("{}")
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  parent        Asset?        @relation("AssetHierarchy", fields: [parentId], references: [id])
  children      Asset[]       @relation("AssetHierarchy")
  workOrders    WorkOrder[]
  pmSchedules   PMSchedule[]
  documents     Document[]

  @@unique([tenantId, assetNumber])
  @@index([tenantId])
  @@index([parentId])
}

model WorkOrder {
  id            String          @id @default(cuid())
  tenantId      String
  woNumber      String          // WO-2024-0001 (auto-increment per tenant)
  title         String
  description   String?
  type          WOType          // CORRECTIVE | PREVENTIVE | INSPECTION | EMERGENCY
  priority      Priority        @default(MEDIUM)
  status        WOStatus        @default(DRAFT)
  assetId       String
  parentId      String?         // sub work order
  assigneeIds   String[]
  dueDate       DateTime?
  slaDeadline   DateTime?
  startedAt     DateTime?
  completedAt   DateTime?
  failureCodeId String?
  resolution    String?
  totalLaborCost Decimal?       @db.Decimal(10,2)
  totalPartsCost Decimal?       @db.Decimal(10,2)
  createdById   String
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  asset         Asset           @relation(fields: [assetId], references: [id])
  laborEntries  LaborEntry[]
  partUsages    PartUsage[]
  attachments   Attachment[]
  comments      Comment[]
  auditLogs     AuditLog[]

  @@unique([tenantId, woNumber])
  @@index([tenantId, status])
  @@index([tenantId, assetId])
  @@index([tenantId, priority, status])  // composite for dashboard queries
}

model PMSchedule {
  id              String        @id @default(cuid())
  tenantId        String
  assetId         String
  title           String
  triggerType     TriggerType   // CALENDAR | METER | CONDITION
  calendarRule    Json?         // { frequency: 'weekly', dayOfWeek: 1 }
  meterRule       Json?         // { field: 'runtime_hours', interval: 250 }
  conditionRule   Json?         // { sensorId, operator, threshold }
  taskList        Json          // Task[]
  estimatedHours  Decimal?      @db.Decimal(5,2)
  isActive        Boolean       @default(true)
  lastTriggered   DateTime?
  nextDue         DateTime?
  createdAt       DateTime      @default(now())

  asset           Asset         @relation(fields: [assetId], references: [id])

  @@index([tenantId, isActive, nextDue])  // for scheduler job
}

model AuditLog {
  id          String   @id @default(cuid())
  tenantId    String
  userId      String
  action      String   // CREATE_WO | UPDATE_STATUS | DELETE_ASSET | ...
  entityType  String
  entityId    String
  before      Json?
  after       Json?
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime @default(now())

  @@index([tenantId, entityType, entityId])
  @@index([tenantId, createdAt])
}
```

---

## API Structure (Fastify)

```typescript
// apps/api/src/routes/index.ts
// ทุก route ต้องมี: authentication, authorization, validation, error handling

// Route Naming Convention: /api/v1/{resource}
// Method Semantics:
//   GET    → idempotent read
//   POST   → create / non-idempotent action
//   PUT    → full replace
//   PATCH  → partial update
//   DELETE → soft delete (ไม่ลบจาก DB จริง ใช้ deletedAt)

const routes = {
  // Work Orders
  'GET    /api/v1/work-orders': 'list with filters + pagination',
  'POST   /api/v1/work-orders': 'create (AI-assisted title/description)',
  'GET    /api/v1/work-orders/:id': 'get detail with related data',
  'PATCH  /api/v1/work-orders/:id': 'update fields',
  'POST   /api/v1/work-orders/:id/assign': 'assign technician',
  'POST   /api/v1/work-orders/:id/complete': 'complete with resolution',
  'POST   /api/v1/work-orders/:id/labor': 'add labor entry',
  'POST   /api/v1/work-orders/:id/parts': 'record part usage',
  'POST   /api/v1/work-orders/:id/comments': 'add comment',
  'GET    /api/v1/work-orders/:id/history': 'full audit trail',

  // Assets
  'GET    /api/v1/assets': 'list + tree structure',
  'POST   /api/v1/assets': 'create',
  'GET    /api/v1/assets/:id': 'get with hierarchy',
  'PATCH  /api/v1/assets/:id': 'update',
  'GET    /api/v1/assets/:id/work-orders': 'WO history for asset',
  'GET    /api/v1/assets/:id/metrics': 'MTBF, MTTR, availability',
  'POST   /api/v1/assets/:id/documents': 'upload document',
  'POST   /api/v1/assets/import': 'bulk import CSV/Excel',

  // PM Schedules
  'GET    /api/v1/pm-schedules': 'list',
  'POST   /api/v1/pm-schedules': 'create',
  'PATCH  /api/v1/pm-schedules/:id': 'update',
  'POST   /api/v1/pm-schedules/:id/trigger': 'manual trigger → create WO',
  'GET    /api/v1/pm-schedules/upcoming': 'next 30/60/90 days calendar',

  // AI Endpoints
  'POST   /api/v1/ai/work-order-draft': 'NL → WO draft',
  'POST   /api/v1/ai/asset-question': 'ask question about asset',
  'POST   /api/v1/ai/analyze-failure': 'failure description → root cause',
  'POST   /api/v1/ai/generate-procedure': 'generate maintenance procedure',
  'POST   /api/v1/ai/report-summary': 'generate period report',

  // Analytics
  'GET    /api/v1/analytics/dashboard': 'KPI summary',
  'GET    /api/v1/analytics/mtbf': 'MTBF trend by asset/category',
  'GET    /api/v1/analytics/cost': 'maintenance cost breakdown',
  'GET    /api/v1/analytics/backlog': 'WO backlog analysis',

  // Integration
  'POST   /api/v1/webhooks/:provider': 'receive external events',
  'GET    /api/v1/integrations': 'list connected integrations',
  'POST   /api/v1/integrations/test': 'test connection',
}
```

---

## AI Integration — Anthropic Claude

```typescript
// packages/domain/src/services/AIService.ts

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic() // uses ANTHROPIC_API_KEY env

// ─── 1. Work Order Draft from Natural Language ───────────────
export async function draftWorkOrderFromNL(input: {
  userMessage: string
  assetContext?: Asset
  recentHistory?: WorkOrder[]
}): Promise<WorkOrderDraft> {

  const systemPrompt = `You are a maintenance management expert.
Convert the user's natural language description into a structured work order.
Respond ONLY with valid JSON matching the WorkOrderDraft schema.
Asset context: ${input.assetContext ? JSON.stringify(input.assetContext) : 'none'}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: input.userMessage }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return WorkOrderDraftSchema.parse(JSON.parse(text))  // Zod validation
}

// ─── 2. Failure Analysis ─────────────────────────────────────
export async function analyzeFailure(input: {
  symptomDescription: string
  assetInfo: Asset
  maintenanceHistory: WorkOrder[]
}): Promise<FailureAnalysis> { ... }

// ─── 3. Generate Maintenance Procedure ───────────────────────
export async function generateProcedure(input: {
  assetType: string
  taskType: string
  safetyRequirements: string[]
}): Promise<MaintenanceProcedure> { ... }

// ─── 4. Conversational Analytics ─────────────────────────────
export async function* streamAnalyticsAnswer(
  question: string,
  analyticsData: AnalyticsSnapshot
): AsyncGenerator<string> {
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: `You are a maintenance analytics expert. Answer questions about the provided data concisely and accurately.
Data: ${JSON.stringify(analyticsData)}`,
    messages: [{ role: 'user', content: question }],
  })

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      yield chunk.delta.text
    }
  }
}
```

---

## Phase 1 — Foundation (เดือน 1–6)

### Sprint 1–2: Project Setup & Core Infrastructure

```bash
# Claude Code — สั่งทำตามลำดับ

1. สร้าง monorepo structure ด้วย pnpm workspaces + Turborepo
2. ตั้งค่า TypeScript strict mode ทุก package
3. ตั้งค่า ESLint (eslint-config-airbnb-typescript) + Prettier
4. ตั้งค่า Husky + lint-staged (pre-commit hooks)
5. ตั้งค่า commitlint (conventional commits)
6. สร้าง Docker Compose: postgres, redis, minio, meilisearch
7. ตั้งค่า Prisma + initial migration
8. ตั้งค่า Fastify app: cors, helmet, rate-limit, pino logger
9. ตั้งค่า Next.js 15 App Router
10. ตั้งค่า GitHub Actions: lint → test → build → deploy
```

### Sprint 3–4: Authentication & Multi-tenancy

```typescript
// ต้องสร้างทั้งหมดนี้:

// 1. Auth Flow
//    POST /api/v1/auth/register    → สร้าง tenant + admin user
//    POST /api/v1/auth/login       → JWT access token (15m) + refresh (7d)
//    POST /api/v1/auth/refresh     → rotate tokens
//    POST /api/v1/auth/logout      → revoke refresh token
//    POST /api/v1/auth/forgot-password
//    POST /api/v1/auth/reset-password

// 2. JWT Middleware
//    - ตรวจ token ทุก request
//    - extract tenantId, userId, role
//    - attach to request context

// 3. RBAC Middleware
//    - Guard decorator: @RequireRole('MANAGER', 'ADMIN')
//    - Permission matrix: role × resource × action

// 4. Row-Level Security (PostgreSQL RLS)
//    ทุก query ต้อง filter ด้วย tenantId โดยอัตโนมัติ
//    ใช้ Prisma middleware เพื่อ inject tenantId

// 5. Invitation System
//    POST /api/v1/invitations  → ส่ง email พร้อม link
//    POST /api/v1/invitations/:token/accept
```

### Sprint 5–8: Work Order Module (Phase 1 target: 65→80)

```typescript
// Work Order ต้องมี features เหล่านี้ใน Phase 1:

// ── Core CRUD ──────────────────────────────────────────────
// - สร้าง WO ด้วย NL (AI) หรือ form
// - WO number auto-generate: WO-2024-000001
// - Priority levels: CRITICAL | HIGH | MEDIUM | LOW
// - Status machine: DRAFT → OPEN → IN_PROGRESS → COMPLETED

// ── Labor & Cost Tracking ────────────────────────────────
interface LaborEntry {
  technicianId: string
  date: Date
  hours: number // decimal: 2.5 hours
  rate: number // baht/hour
  description: string
}
// total cost auto-calculate = hours × rate

// ── Part Usage ───────────────────────────────────────────
interface PartUsage {
  partId: string
  quantity: number
  unitCost: number // snapshot ราคา ณ เวลาใช้
}
// ตัด stock อัตโนมัติเมื่อบันทึก

// ── SLA Management ──────────────────────────────────────
// - กำหนด SLA deadline ตาม priority
// - แจ้งเตือนเมื่อใกล้ deadline
// - escalation อัตโนมัติเมื่อ overdue

// ── Attachments ─────────────────────────────────────────
// - upload photos/documents (MinIO)
// - max 20MB per file, 10 files per WO
// - generate thumbnail สำหรับ images

// ── Comments & Collaboration ────────────────────────────
// - real-time comments ผ่าน WebSocket
// - @mention technician
// - ส่ง email notification

// ── Digital Signature ───────────────────────────────────
// - sign บน mobile (canvas)
// - บันทึก signature image + timestamp + IP

// ── Sub Work Orders ─────────────────────────────────────
// - WO หนึ่งมีลูกได้หลาย WO
// - parent WO complete ได้เมื่อ sub-WO ทั้งหมด complete
```

### Sprint 9–12: Asset Management Module (Phase 1 target: 55→75)

```typescript
// Asset hierarchy สูงสุด 5 ระดับ:
// Plant > Building > System > Equipment > Component

interface AssetHierarchyNode {
  id: string
  name: string
  assetNumber: string
  level: 1 | 2 | 3 | 4 | 5
  parentId: string | null
  children: AssetHierarchyNode[]
  workOrderCount: number // open WOs
  lastMaintenanceDate: Date | null
}

// ── Features ────────────────────────────────────────────
// 1. Tree view (collapsible hierarchy)
// 2. QR code generation per asset
// 3. Mobile QR scan → open asset page
// 4. Document management (manuals, P&IDs, certificates)
// 5. Depreciation calculation (straight-line, DB methods)
// 6. Warranty tracking + expiry alerts
// 7. Custom fields per asset category
// 8. Bulk import จาก CSV/Excel (ด้วย validation)
// 9. Asset transfer between locations/owners
// 10. Decommission workflow (approval required)
```

### Sprint 13–16: Preventive Maintenance (Phase 1 target: 50→72)

```typescript
// PM Schedule Types:

// 1. Calendar-based
const calendarPM: PMSchedule = {
  triggerType: 'CALENDAR',
  calendarRule: {
    frequency: 'monthly',
    dayOfMonth: 1, // วันที่ 1 ของทุกเดือน
    advanceNotice: 7, // แจ้งล่วงหน้า 7 วัน
  },
}

// 2. Meter-based (runtime hours, km, cycles)
const meterPM: PMSchedule = {
  triggerType: 'METER',
  meterRule: {
    meterField: 'runtime_hours',
    interval: 250, // ทุก 250 ชั่วโมง
    tolerance: 10, // ±10 ชั่วโมง
    currentReading: 1842,
  },
}

// ── PM Scheduler Job (BullMQ) ────────────────────────────
// ทำงานทุกวัน 00:00 UTC
// 1. ดึง PM schedules ที่ active และถึงเวลา
// 2. สร้าง Work Orders อัตโนมัติ
// 3. assign technician ตาม skill matching
// 4. ส่ง notification
// 5. log ทุก trigger

// ── Task List Builder ────────────────────────────────────
interface Task {
  sequence: number
  title: string
  instructions: string
  requiresPhoto: boolean
  requiresReading: boolean // meter reading
  readingUnit?: string
  estimatedMinutes: number
  isCritical: boolean // ถ้าไม่ทำ WO complete ไม่ได้
}

// ── Failure Code System ──────────────────────────────────
// ISO 14224 taxonomy
// Category → System → Component → Failure Mode
// ใช้ตอน close WO เพื่อ analysis
```

### Sprint 17–20: Integration Layer (Phase 1 target: 30→55)

```typescript
// ── REST API ────────────────────────────────────────────
// OpenAPI 3.0 spec auto-generated จาก Fastify schemas
// Swagger UI ที่ /api/docs (dev only)
// SDK generation ด้วย openapi-typescript

// ── Webhooks ────────────────────────────────────────────
// Events ที่ส่งออก:
const webhookEvents = [
  'work_order.created',
  'work_order.assigned',
  'work_order.completed',
  'asset.status_changed',
  'pm_schedule.triggered',
  'part.low_stock',
  'sla.breached',
]

// Webhook delivery:
// - retry 3 ครั้ง (exponential backoff: 1m, 5m, 30m)
// - HMAC-SHA256 signature header
// - delivery log + replay

// ── Import/Export ────────────────────────────────────────
// CSV Import: assets, work orders, parts, users
// Excel Export: reports, asset register, WO history
// ใช้ SheetJS (xlsx) สำหรับ Excel

// ── SSO (SAML 2.0 + OAuth 2.0) ──────────────────────────
// Providers: Google Workspace, Microsoft Azure AD
// SAML สำหรับ enterprise customers
// ใช้ passport.js strategies

// ── Zapier/Make Webhook Trigger ─────────────────────────
// ทำ generic webhook receiver
// Map inbound events → MaintainHub actions
```

---

## Phase 2 — Enterprise Core (เดือน 7–18)

### IoT & Sensor Integration (Preventive: 72→88, AI: 93→96)

```typescript
// ── MQTT Broker Integration ──────────────────────────────
// ใช้ EMQX (self-hosted) หรือ AWS IoT Core

interface SensorReading {
  sensorId: string
  assetId: string
  timestamp: Date
  readings: {
    temperature?: number // °C
    vibration?: number // mm/s RMS
    pressure?: number // bar
    humidity?: number // %RH
    rpm?: number
    current?: number // Amps
    voltage?: number
  }
}

// ── Condition-Based PM Trigger ───────────────────────────
interface ConditionRule {
  sensorId: string
  metric: string
  operator: '>' | '<' | '>=' | '<=' | '==' | '!='
  threshold: number
  duration?: number // ต้อง exceed นานกี่นาที
  cooldown?: number // ไม่ trigger อีกภายใน X นาที
}

// ── Anomaly Detection (ML) ───────────────────────────────
// ใช้ Claude AI วิเคราะห์ time-series pattern
// เปรียบเทียบกับ baseline (30 วันที่ผ่านมา)
// ส่ง alert เมื่อ anomaly score > threshold

// ── Real-time Dashboard ──────────────────────────────────
// WebSocket stream sensor readings
// Gauge charts: current values vs limits
// Trend charts: 24h / 7d / 30d
// Alert feed: real-time anomaly alerts
```

### Multi-site & Contractor Portal

```typescript
// ── Multi-site Management ────────────────────────────────
// Site = independent operational unit (โรงงาน, อาคาร)
// Tenant admin เห็น consolidated view
// Site manager เห็นเฉพาะ site ตัวเอง

// ── Contractor Portal ────────────────────────────────────
// Contractor ล็อกอินด้วย link (ไม่ต้องมี account ในระบบ)
// เห็นเฉพาะ WO ที่ assign ให้
// บันทึก labor, parts, รูปถ่าย, signature
// ไม่เห็นข้อมูล asset อื่นๆ

// ── Permit-to-Work (PTW) ─────────────────────────────────
interface PermitToWork {
  type: 'HOT_WORK' | 'CONFINED_SPACE' | 'ELECTRICAL' | 'HEIGHT' | 'CHEMICAL'
  riskAssessment: string
  precautions: string[]
  requiredPPE: string[]
  isolationPoints: IsolationPoint[]
  approver: UserId
  approvedAt?: Date
  validFrom: Date
  validUntil: Date
  signature?: string // approver digital signature
}
// WO ที่กำหนด PTW จะ complete ไม่ได้ถ้า PTW ยังไม่ approved
```

### ERP Integration (Integration: 55→80)

```typescript
// ── SAP Integration ──────────────────────────────────────
// ใช้ SAP RFC / BAPI หรือ SAP OData API
// Sync: Assets (Equipment Master), WO → PM Orders
// Bi-directional: cost posting กลับ SAP

// ── Generic ERP Adapter Pattern ─────────────────────────
interface ERPAdapter {
  name: string
  syncAssets(filter: DateRange): Promise<AssetSyncResult>
  createWorkOrder(wo: WorkOrder): Promise<ERPWorkOrderId>
  postCosts(wo: WorkOrder): Promise<void>
  syncInventory(): Promise<InventorySyncResult>
}

class SAPAdapter implements ERPAdapter { ... }
class OracleEBSAdapter implements ERPAdapter { ... }
class NetSuiteAdapter implements ERPAdapter { ... }

// ── LDAP / Active Directory ──────────────────────────────
// sync users จาก corporate directory
// map AD groups → MaintainHub roles
```

---

## Phase 3 — Enterprise Complete (เดือน 19–36)

### Digital Twin & Reliability Engineering

```typescript
// ── Digital Twin Integration ─────────────────────────────
// เชื่อม BIM models (IFC format) กับ assets
// 3D viewer ใน browser (Three.js)
// Click บน 3D model → open asset page
// แสดง sensor readings overlay บน 3D model

// ── RCM (Reliability-Centered Maintenance) ──────────────
interface FMEA {
  assetId: AssetId
  system: string
  function: string // asset's intended function
  functionalFailure: string // การที่ function ล้มเหลว
  failureMode: string // กลไกที่ทำให้ failure
  failureEffect: string // ผลกระทบของ failure
  severity: 1 | 2 | 3 | 4 | 5
  occurrence: 1 | 2 | 3 | 4 | 5
  detection: 1 | 2 | 3 | 4 | 5
  rpn: number // = severity × occurrence × detection
  maintenanceTask: string
  taskInterval: string
}

// ── Predictive ML Model ──────────────────────────────────
// ใช้ sensor time-series + maintenance history + FMEA
// ส่ง data ไป Claude AI เพื่อ predict remaining useful life (RUL)
// แสดง predicted failure date + confidence interval

// ── GIS / Spatial Features ──────────────────────────────
// Mapbox GL JS integration
// Asset markers บน map จริง
// Heat map: maintenance cost per area
// Route optimization สำหรับ technician rounds
```

### Compliance & Audit

```typescript
// ── Compliance Framework ─────────────────────────────────
// ISO 55000: Asset management standard
// IEC 62443: Industrial cybersecurity
// FDA 21 CFR Part 11: Electronic records (pharmaceutical)
// ISO 14224: Failure reporting & analysis

// ── Audit Trail ─────────────────────────────────────────
// ทุก data change ต้อง log:
// - entity, field, old value, new value
// - user, timestamp, IP, session ID
// - immutable (ลบไม่ได้ แม้ admin)
// - export เป็น PDF สำหรับ audit

// ── Electronic Signatures (FDA CFR Part 11) ─────────────
// สำหรับ pharmaceutical clients
// Require password re-authentication ก่อน sign
// Meaning of signature (approve, review, etc.)
// Signature manifest ใน PDF
```

---

## Frontend Architecture

### Component Structure

```
apps/web/src/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # auth pages (no sidebar)
│   │   ├── login/
│   │   └── register/
│   ├── (dashboard)/            # main app (with sidebar)
│   │   ├── layout.tsx          # sidebar + topbar
│   │   ├── page.tsx            # dashboard overview
│   │   ├── work-orders/
│   │   │   ├── page.tsx        # list view
│   │   │   ├── new/page.tsx    # create (AI chat or form)
│   │   │   └── [id]/
│   │   │       ├── page.tsx    # detail view
│   │   │       └── edit/
│   │   ├── assets/
│   │   ├── pm-schedules/
│   │   ├── inventory/
│   │   ├── analytics/
│   │   └── settings/
│   └── api/                    # Next.js API routes (thin proxy)
├── components/
│   ├── ui/                     # shadcn/ui base components
│   ├── work-orders/
│   │   ├── WorkOrderCard.tsx
│   │   ├── WorkOrderForm.tsx
│   │   ├── WorkOrderKanban.tsx # drag-and-drop status board
│   │   ├── LaborEntryDialog.tsx
│   │   └── AIAssistPanel.tsx   # AI chat side panel
│   ├── assets/
│   │   ├── AssetTree.tsx       # hierarchical tree
│   │   ├── AssetCard.tsx
│   │   └── QRCodeDisplay.tsx
│   ├── charts/
│   │   ├── MTBFTrend.tsx
│   │   ├── CostBreakdown.tsx
│   │   └── SensorGauge.tsx
│   └── layout/
│       ├── Sidebar.tsx
│       ├── TopBar.tsx
│       └── NotificationPanel.tsx
├── hooks/
│   ├── useWorkOrders.ts        # TanStack Query hooks
│   ├── useAssets.ts
│   ├── useRealtime.ts          # Socket.io hooks
│   └── useAI.ts               # streaming AI responses
├── stores/
│   ├── authStore.ts            # Zustand
│   ├── uiStore.ts
│   └── notificationStore.ts
└── lib/
    ├── api.ts                  # typed API client
    ├── socket.ts               # Socket.io setup
    └── utils.ts
```

### AI Chat Interface

```tsx
// components/work-orders/AIAssistPanel.tsx
// Panel ด้านขวา — user พิมพ์ภาษาธรรมชาติ

function AIAssistPanel({ onWorkOrderDraft }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)

  const sendMessage = async (text: string) => {
    // ส่งไป /api/v1/ai/work-order-draft
    // รับ streaming response
    // render markdown + structured WO preview
    // ถ้า user confirm → สร้าง WO จริง
  }

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} />
      <WorkOrderPreview draft={currentDraft} onConfirm={handleConfirm} />
      <ChatInput onSend={sendMessage} disabled={streaming} />
    </div>
  )
}
```

---

## Performance Requirements

```yaml
API Response Times (p95):
  - List queries:     < 200ms
  - Detail queries:   < 100ms
  - Create/Update:    < 300ms
  - AI responses:     < 3s (first token)
  - File upload:      < 5s (10MB)

Database:
  - ทุก foreign key ต้องมี index
  - ทุก WHERE clause ที่ใช้บ่อยต้องมี composite index
  - Query plan ต้อง explain ก่อน production
  - Connection pooling: PgBouncer

Frontend:
  - Lighthouse score: > 90 (Performance, Accessibility)
  - Core Web Vitals: LCP < 2.5s, CLS < 0.1, FID < 100ms
  - Bundle size: < 200KB (initial JS)
  - ใช้ React Server Components ลด client-side JS

Caching Strategy:
  - Redis: session, rate limit, frequent queries (TTL 5min)
  - CDN: static assets, API responses ที่ไม่ sensitive
  - Next.js: ISR สำหรับ public pages
```

---

## Error Handling & Observability

```typescript
// ── Structured Error Responses ───────────────────────────
interface APIError {
  code: string // WORK_ORDER_NOT_FOUND, INSUFFICIENT_PERMISSIONS
  message: string // human-readable
  details?: unknown // validation errors, etc.
  requestId: string // สำหรับ trace
}

// ── Global Error Handler (Fastify) ──────────────────────
app.setErrorHandler((error, request, reply) => {
  const requestId = request.id
  logger.error({ error, requestId }, 'Unhandled error')

  if (error instanceof DomainException) {
    return reply.status(422).send({ code: error.code, message: error.message, requestId })
  }
  if (error instanceof ZodError) {
    return reply.status(400).send({ code: 'VALIDATION_ERROR', details: error.flatten(), requestId })
  }
  // ไม่ leak stack trace ใน production
  return reply
    .status(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId })
})

// ── Distributed Tracing ──────────────────────────────────
// OpenTelemetry traces: request → DB → AI → response
// Grafana Tempo สำหรับ trace visualization
// Alert เมื่อ error rate > 1% หรือ p95 latency > SLA

// ── Health Checks ────────────────────────────────────────
// GET /health → { status: 'ok', db: 'ok', redis: 'ok', ... }
// GET /metrics → Prometheus format
// Kubernetes liveness + readiness probes
```

---

## การสั่ง Claude Code

### วิธีใช้ prompt นี้

```bash
# 1. เปิด Claude Code
claude

# 2. ให้ Claude Code อ่าน prompt นี้ก่อน
> Read this entire document and confirm you understand the architecture

# 3. เริ่ม Phase 1 ทีละ Sprint
> Implement Sprint 1-2: Project setup with pnpm monorepo,
  Turborepo, TypeScript strict, ESLint, Prettier, Husky,
  Docker Compose with postgres/redis/minio/meilisearch,
  Prisma initial schema, Fastify app skeleton, Next.js 15 setup,
  and GitHub Actions CI pipeline

# 4. ตรวจสอบและ iterate
> Run all tests and fix any failures
> Review the code for SOLID principles violations
> Add missing indexes to the Prisma schema

# 5. ดำเนินต่อทีละ sprint
> Implement Sprint 3-4: Authentication with JWT,
  refresh tokens, RBAC middleware, and Row-Level Security
```

### คำสั่งที่มีประโยชน์

```bash
# ตรวจสอบ type errors
> Run tsc --noEmit across all packages and fix all errors

# เพิ่ม tests
> Write unit tests for all domain entities
  achieving >95% coverage on the domain package

# ตรวจ security
> Review all API endpoints for missing authentication,
  authorization, input validation, and SQL injection risks

# Optimize performance
> Run EXPLAIN ANALYZE on the 10 most common queries
  and add appropriate indexes

# Generate API docs
> Generate OpenAPI 3.0 spec from all Fastify route schemas
  and ensure all endpoints are documented

# Phase transition
> We're moving to Phase 2. Implement IoT sensor integration
  using MQTT with the schema defined in this document.
  Start with the data ingestion pipeline and condition-based triggers.
```

---

## Definition of Done — ทุก Feature

ก่อน merge feature ใดๆ ต้องผ่านเกณฑ์ทั้งหมด:

- [ ] Unit tests ครอบคลุม domain logic ≥ 95%
- [ ] Integration tests สำหรับ API endpoints
- [ ] TypeScript strict — zero errors
- [ ] ESLint — zero warnings
- [ ] OpenAPI spec อัพเดต
- [ ] Audit log บันทึกทุก mutation
- [ ] Error handling ครบ — ไม่มี unhandled exception
- [ ] Multi-tenant isolation ทดสอบแล้ว (tenant A ไม่เห็นข้อมูล tenant B)
- [ ] Performance: query เร็วกว่า SLA target
- [ ] Security: input validation ด้วย Zod, output sanitized
- [ ] README อัพเดต (ถ้ามี setup steps ใหม่)

---

_MaintainHub Build Specification v1.0_
_Roadmap: 36 months to Enterprise CMMS — 99/100 across all dimensions_
