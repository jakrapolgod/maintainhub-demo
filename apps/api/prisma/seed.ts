/* eslint-disable no-console, @typescript-eslint/no-unused-vars */
/**
 * Seed script — idempotent dev/test data.
 * Run: pnpm --filter @maintainhub/api db:seed
 * Requires DATABASE_URL in apps/api/.env (copy from root .env.example)
 *
 * Demo credentials (all users):  Password123!
 */

import {
  AssetStatus,
  Criticality,
  Plan,
  PrismaClient,
  Priority,
  Role,
  TriggerType,
  WOStatus,
  WOType,
} from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient({ log: ['warn', 'error'] })

// ── Helpers ───────────────────────────────────────────────────────────────────

const hash = (plain: string) => bcrypt.hash(plain, 12)

function nextMonthFirst(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 1)
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

function daysFromNow(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱  Seeding MaintainHub database…')

  // ── 1. Wipe in FK-safe order ───────────────────────────────────────────────
  await prisma.auditLog.deleteMany()
  await prisma.comment.deleteMany()
  await prisma.attachment.deleteMany()
  await prisma.partUsage.deleteMany()
  await prisma.laborEntry.deleteMany()
  await prisma.workOrder.deleteMany()
  await prisma.pMSchedule.deleteMany()
  await prisma.part.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.assetCategory.deleteMany()
  await prisma.location.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.user.deleteMany()
  await prisma.tenant.deleteMany()
  await prisma.failureCode.deleteMany()

  // ── 2. Global failure codes (ISO 14224) ───────────────────────────────────
  const [fcSeal, fcOverload, fcLubrication, fcVibration, fcCorrosion] = await Promise.all([
    prisma.failureCode.create({
      data: {
        code: 'MECH-001',
        name: 'Mechanical Seal Failure',
        category: 'Mechanical',
        system: 'Sealing System',
        notes: 'Check seal flush plan, product temperature, and shaft runout.',
      },
    }),
    prisma.failureCode.create({
      data: {
        code: 'ELEC-001',
        name: 'Motor Overload',
        category: 'Electrical',
        system: 'Drive System',
        notes: 'Verify current draw against nameplate, check for blocked impeller.',
      },
    }),
    prisma.failureCode.create({
      data: {
        code: 'LUBR-001',
        name: 'Lubrication Failure',
        category: 'Mechanical',
        system: 'Lubrication System',
        notes: 'Inspect grease/oil level, quality, and re-lubrication intervals.',
      },
    }),
    prisma.failureCode.create({
      data: {
        code: 'VIBR-001',
        name: 'Excessive Vibration',
        category: 'Mechanical',
        system: 'Rotating Equipment',
        notes: 'Check alignment, balance, bearing condition, and foundation bolts.',
      },
    }),
    prisma.failureCode.create({
      data: {
        code: 'CORR-001',
        name: 'Corrosion / Erosion',
        category: 'Material',
        system: 'Pressure Containment',
        notes: 'Assess material compatibility and coating condition.',
      },
    }),
  ])

  // ── 3. Tenant ─────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Demo Manufacturing Co.',
      slug: 'demo-corp',
      plan: Plan.PROFESSIONAL,
      settings: {
        timezone: 'Asia/Bangkok',
        currency: 'THB',
        fiscalYearStart: '01-01',
        slaRules: {
          CRITICAL: 4,
          HIGH: 24,
          MEDIUM: 72,
          LOW: 168,
        },
      },
    },
  })

  // ── 4. Users ──────────────────────────────────────────────────────────────
  const DEMO_PASS = await hash('Password123!')

  const [admin, manager, tech1, tech2, viewer] = await Promise.all([
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'admin@demo.com',
        name: 'Admin User',
        passwordHash: DEMO_PASS,
        role: Role.ADMIN,
        jobTitle: 'System Administrator',
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'manager@demo.com',
        name: 'Somchai Maintenance',
        passwordHash: DEMO_PASS,
        role: Role.MANAGER,
        jobTitle: 'Maintenance Manager',
        phone: '+66-81-234-5678',
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'alice@demo.com',
        name: 'Alice Chen',
        passwordHash: DEMO_PASS,
        role: Role.TECHNICIAN,
        jobTitle: 'Senior Mechanical Technician',
        skills: ['Mechanical', 'Hydraulics', 'Pneumatics', 'Welding'],
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'bob@demo.com',
        name: 'Bob Smith',
        passwordHash: DEMO_PASS,
        role: Role.TECHNICIAN,
        jobTitle: 'Electrical & Instrumentation Technician',
        skills: ['Electrical', 'PLC', 'Instrumentation', 'SCADA'],
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'viewer@demo.com',
        name: 'Charlie Viewer',
        passwordHash: DEMO_PASS,
        role: Role.VIEWER,
        jobTitle: 'Operations Supervisor',
      },
    }),
  ])

  // ── 5. Location hierarchy ─────────────────────────────────────────────────
  const plantA = await prisma.location.create({
    data: { tenantId: tenant.id, code: 'PLT-A', name: 'Plant A — Main Facility' },
  })

  const [bld1, bld2] = await Promise.all([
    prisma.location.create({
      data: {
        tenantId: tenant.id,
        code: 'BLD-1',
        name: 'Building 1 — Production',
        parentId: plantA.id,
      },
    }),
    prisma.location.create({
      data: {
        tenantId: tenant.id,
        code: 'BLD-2',
        name: 'Building 2 — Utilities',
        parentId: plantA.id,
      },
    }),
  ])

  const [workshop, utilityRoom, compressorRoom] = await Promise.all([
    prisma.location.create({
      data: {
        tenantId: tenant.id,
        code: 'WS-01',
        name: 'Workshop',
        parentId: bld1.id,
      },
    }),
    prisma.location.create({
      data: {
        tenantId: tenant.id,
        code: 'UT-01',
        name: 'Utility Room',
        parentId: bld1.id,
      },
    }),
    prisma.location.create({
      data: {
        tenantId: tenant.id,
        code: 'CR-01',
        name: 'Compressor Room',
        parentId: bld2.id,
      },
    }),
  ])

  // ── 6. Asset categories ────────────────────────────────────────────────────
  const [catPump, catMotor, catHVAC, catCompressor] = await Promise.all([
    prisma.assetCategory.create({
      data: { tenantId: tenant.id, code: 'PUMP', name: 'Pump' },
    }),
    prisma.assetCategory.create({
      data: { tenantId: tenant.id, code: 'MOTOR', name: 'Electric Motor' },
    }),
    prisma.assetCategory.create({
      data: { tenantId: tenant.id, code: 'HVAC', name: 'HVAC Equipment' },
    }),
    prisma.assetCategory.create({
      data: { tenantId: tenant.id, code: 'COMP', name: 'Compressor' },
    }),
  ])

  // ── 7. Assets (hierarchy: Plant > Building > Equipment > Component) ────────
  const pump = await prisma.asset.create({
    data: {
      tenantId: tenant.id,
      assetNumber: 'P-101',
      name: 'Centrifugal Pump P-101',
      description: 'Process water circulation pump — primary cooling loop',
      categoryId: catPump.id,
      locationId: workshop.id,
      criticality: Criticality.A,
      status: AssetStatus.OPERATIONAL,
      manufacturer: 'Grundfos',
      model: 'CR5-8 A-A-A-E-HQQE',
      serialNumber: 'GF-2021-00523',
      installDate: new Date('2021-03-15'),
      warrantyExpiry: new Date('2024-03-15'),
      purchaseCost: '45000.00',
      qrCode: 'MH-P-101',
      customFields: { ratedFlow: '5 m³/h', ratedHead: '80 m', motorPower: '2.2 kW' },
    },
  })

  const [pumpMotor, mechanicalSeal] = await Promise.all([
    prisma.asset.create({
      data: {
        tenantId: tenant.id,
        assetNumber: 'M-101',
        name: 'Drive Motor M-101',
        description: '2.2 kW drive motor for pump P-101',
        categoryId: catMotor.id,
        locationId: workshop.id,
        parentId: pump.id,
        criticality: Criticality.A,
        status: AssetStatus.OPERATIONAL,
        manufacturer: 'ABB',
        model: 'M2BAX 90S-4',
        serialNumber: 'ABB-2021-10983',
        installDate: new Date('2021-03-15'),
        qrCode: 'MH-M-101',
        customFields: { voltageV: 380, currentA: 5.3, powerFactorCos: 0.81 },
      },
    }),
    prisma.asset.create({
      data: {
        tenantId: tenant.id,
        assetNumber: 'SE-101',
        name: 'Mechanical Seal SE-101',
        description: 'Single mechanical seal assembly for P-101',
        categoryId: catPump.id,
        locationId: workshop.id,
        parentId: pump.id,
        criticality: Criticality.B,
        status: AssetStatus.OPERATIONAL,
        manufacturer: 'John Crane',
        model: 'Type 21',
        serialNumber: 'JC-2023-44512',
        installDate: new Date('2024-01-18'),
        qrCode: 'MH-SE-101',
      },
    }),
  ])

  const ahu = await prisma.asset.create({
    data: {
      tenantId: tenant.id,
      assetNumber: 'AHU-001',
      name: 'Air Handling Unit AHU-001',
      description: 'Roof-mounted AHU serving production floor — 10,000 CFM',
      categoryId: catHVAC.id,
      locationId: utilityRoom.id,
      criticality: Criticality.B,
      status: AssetStatus.OPERATIONAL,
      manufacturer: 'Daikin',
      model: 'AHU-10T-D',
      serialNumber: 'DK-2020-88234',
      installDate: new Date('2020-07-01'),
      warrantyExpiry: new Date('2025-07-01'),
      purchaseCost: '280000.00',
      qrCode: 'MH-AHU-001',
      customFields: { capacityCFM: 10000, coolingCapacityTon: 10 },
    },
  })

  const compressor = await prisma.asset.create({
    data: {
      tenantId: tenant.id,
      assetNumber: 'AC-001',
      name: 'Air Compressor AC-001',
      description: 'Screw compressor — instrument air supply',
      categoryId: catCompressor.id,
      locationId: compressorRoom.id,
      criticality: Criticality.A,
      status: AssetStatus.OPERATIONAL,
      manufacturer: 'Atlas Copco',
      model: 'GA15',
      serialNumber: 'AC-2019-55671',
      installDate: new Date('2019-04-10'),
      purchaseCost: '360000.00',
      qrCode: 'MH-AC-001',
      customFields: { pressureBar: 8, flowNm3h: 90, powerKW: 15 },
    },
  })

  // ── 8. Inventory — spare parts ────────────────────────────────────────────
  const [partSeal, partBearing, partBelt, partGrease, partFilter] = await Promise.all([
    prisma.part.create({
      data: {
        tenantId: tenant.id,
        partNumber: 'SK-JC21-P101',
        name: 'Mechanical Seal Kit — John Crane Type 21 (P-101)',
        quantity: 3,
        reservedQty: 0,
        minimumStock: 2,
        unitCost: '4500.00',
        storeLocation: 'Shelf A1-01',
      },
    }),
    prisma.part.create({
      data: {
        tenantId: tenant.id,
        partNumber: 'BR-6205-2RS',
        name: 'Deep Groove Ball Bearing 6205-2RS',
        quantity: 12,
        reservedQty: 0,
        minimumStock: 6,
        unitCost: '380.00',
        storeLocation: 'Shelf A2-03',
      },
    }),
    prisma.part.create({
      data: {
        tenantId: tenant.id,
        partNumber: 'VB-A42',
        name: 'V-Belt A42',
        quantity: 8,
        reservedQty: 0,
        minimumStock: 4,
        unitCost: '220.00',
        storeLocation: 'Shelf B1-02',
      },
    }),
    prisma.part.create({
      data: {
        tenantId: tenant.id,
        partNumber: 'LU-SKF-LGHP2-400',
        name: 'SKF LGHP2 High-Performance Grease 400g',
        quantity: 20,
        reservedQty: 0,
        minimumStock: 8,
        unitCost: '650.00',
        storeLocation: 'Shelf C1-01',
      },
    }),
    prisma.part.create({
      data: {
        tenantId: tenant.id,
        partNumber: 'FT-AHU001-G4',
        name: 'G4 Pre-filter for AHU-001 (600×600 mm)',
        quantity: 6,
        reservedQty: 0,
        minimumStock: 4,
        unitCost: '1200.00',
        storeLocation: 'Shelf D2-01',
      },
    }),
  ])

  // ── 9. Work orders ────────────────────────────────────────────────────────

  // WO-1: Completed — seal replacement
  const wo1 = await prisma.workOrder.create({
    data: {
      tenantId: tenant.id,
      woNumber: 'WO-2024-000001',
      title: 'P-101 Mechanical Seal Replacement',
      description:
        'Pump P-101 reported minor seal weep. Replace mechanical seal before failure escalates to critical leak.',
      type: WOType.CORRECTIVE,
      priority: Priority.HIGH,
      status: WOStatus.COMPLETED,
      assetId: pump.id,
      assigneeIds: [tech1.id],
      dueDate: daysAgo(14),
      slaDeadline: daysAgo(13),
      startedAt: new Date(daysAgo(14).setHours(9, 0, 0)),
      completedAt: new Date(daysAgo(14).setHours(14, 30, 0)),
      failureCodeId: fcSeal.id,
      resolution:
        'Replaced John Crane Type 21 mechanical seal. Cleaned stuffing box. Aligned shaft to within 0.02mm TIR. Tested under pressure — zero leakage confirmed. Parts: 1× seal kit.',
      totalLaborCost: '1250.00',
      totalPartsCost: '4500.00',
      createdById: manager.id,
    },
  })

  await prisma.laborEntry.create({
    data: {
      workOrderId: wo1.id,
      technicianId: tech1.id,
      date: daysAgo(14),
      hours: '5.50',
      ratePerHour: '500.00',
      totalCost: '2750.00',
      description: 'Mechanical seal replacement including shutdown, swap, and pressure test.',
    },
  })

  await prisma.partUsage.create({
    data: {
      workOrderId: wo1.id,
      partId: partSeal.id,
      quantity: 1,
      unitCost: '4500.00',
      totalCost: '4500.00',
      usedAt: daysAgo(14),
    },
  })

  await prisma.comment.create({
    data: {
      workOrderId: wo1.id,
      authorId: tech1.id,
      body: 'Removed old seal — significant face wear observed on stationary ring. Root cause: likely product running dry during last process upset on Dec 12.',
    },
  })

  await prisma.comment.create({
    data: {
      workOrderId: wo1.id,
      authorId: manager.id,
      body: "Good catch Alice. Let's add a dry-run protection relay to the PM checklist for this pump.",
    },
  })

  // WO-2: In-progress — AHU quarterly PM
  const wo2 = await prisma.workOrder.create({
    data: {
      tenantId: tenant.id,
      woNumber: 'WO-2024-000002',
      title: 'AHU-001 Quarterly Preventive Maintenance',
      description:
        'Quarterly inspection and servicing of Air Handling Unit AHU-001. Replace pre-filters, clean coils, check belt tension, lubricate bearings.',
      type: WOType.PREVENTIVE,
      priority: Priority.MEDIUM,
      status: WOStatus.IN_PROGRESS,
      assetId: ahu.id,
      assigneeIds: [tech1.id, tech2.id],
      dueDate: daysFromNow(2),
      slaDeadline: daysFromNow(3),
      startedAt: new Date(new Date().setHours(8, 0, 0)),
      createdById: manager.id,
    },
  })

  await prisma.laborEntry.create({
    data: {
      workOrderId: wo2.id,
      technicianId: tech1.id,
      date: new Date(),
      hours: '2.00',
      ratePerHour: '500.00',
      totalCost: '1000.00',
      description: 'Filter replacement and coil inspection completed.',
    },
  })

  await prisma.comment.create({
    data: {
      workOrderId: wo2.id,
      authorId: tech2.id,
      body: 'Pre-filters replaced (found G4 rating degraded to ~60% flow). Coil fins slightly fouled — cleaned with low-pressure water rinse. Belt tension checked: OK at 42Hz deflection.',
    },
  })

  // WO-3: Open — motor vibration
  const wo3 = await prisma.workOrder.create({
    data: {
      tenantId: tenant.id,
      woNumber: 'WO-2024-000003',
      title: 'M-101 Drive Motor — Excessive Vibration Investigation',
      description:
        'Vibration sensor on motor M-101 triggered alert at 7.2 mm/s RMS (limit 4.5 mm/s). Investigate root cause — possible bearing wear or misalignment.',
      type: WOType.CORRECTIVE,
      priority: Priority.CRITICAL,
      status: WOStatus.OPEN,
      assetId: pumpMotor.id,
      assigneeIds: [tech1.id],
      dueDate: daysFromNow(1),
      slaDeadline: daysFromNow(0),
      createdById: manager.id,
    },
  })

  // WO-4: Draft — compressor annual inspection
  await prisma.workOrder.create({
    data: {
      tenantId: tenant.id,
      woNumber: 'WO-2025-000001',
      title: 'AC-001 Annual Inspection & Oil Change',
      description: 'Scheduled annual inspection for Atlas Copco GA15 compressor.',
      type: WOType.INSPECTION,
      priority: Priority.LOW,
      status: WOStatus.DRAFT,
      assetId: compressor.id,
      assigneeIds: [],
      dueDate: daysFromNow(30),
      createdById: manager.id,
    },
  })

  // ── 10. PM Schedules ──────────────────────────────────────────────────────
  await prisma.pMSchedule.create({
    data: {
      tenantId: tenant.id,
      assetId: pump.id,
      title: 'P-101 Monthly Inspection',
      description: 'Monthly condition monitoring and preventive checks for pump P-101.',
      triggerType: TriggerType.CALENDAR,
      calendarRule: {
        frequency: 'monthly',
        dayOfMonth: 1,
        advanceNoticeDays: 3,
      },
      taskList: [
        {
          sequence: 1,
          title: 'Check oil level',
          instructions:
            'Inspect bearing housing oil sight glass. Top up if below MIN mark. Oil type: ISO VG 68.',
          requiresPhoto: true,
          requiresReading: false,
          estimatedMinutes: 5,
          isCritical: false,
        },
        {
          sequence: 2,
          title: 'Measure bearing temperature',
          instructions:
            'Use IR thermometer on DE and NDE bearing housings. Max allowable: 80°C. Alert if >70°C.',
          requiresPhoto: false,
          requiresReading: true,
          readingUnit: '°C',
          estimatedMinutes: 5,
          isCritical: true,
        },
        {
          sequence: 3,
          title: 'Inspect mechanical seal for leaks',
          instructions:
            'Check seal chamber for signs of product leakage. Any dripping = escalate immediately.',
          requiresPhoto: true,
          requiresReading: false,
          estimatedMinutes: 5,
          isCritical: true,
        },
        {
          sequence: 4,
          title: 'Check coupling alignment',
          instructions:
            'Verify coupling guard is secure. Check for unusual noise or vibration during operation.',
          requiresPhoto: false,
          requiresReading: false,
          estimatedMinutes: 5,
          isCritical: false,
        },
        {
          sequence: 5,
          title: 'Record operating data',
          instructions:
            'Note suction & discharge pressure, flow rate, amps, and vibration level (velocity mm/s).',
          requiresPhoto: false,
          requiresReading: true,
          readingUnit: 'various',
          estimatedMinutes: 10,
          isCritical: false,
        },
      ],
      estimatedHours: '0.50',
      requiredSkills: ['Mechanical'],
      isActive: true,
      lastTriggered: daysAgo(30),
      nextDue: nextMonthFirst(),
      createdById: manager.id,
    },
  })

  await prisma.pMSchedule.create({
    data: {
      tenantId: tenant.id,
      assetId: ahu.id,
      title: 'AHU-001 Quarterly Maintenance',
      description: 'Full quarterly PM covering filters, coils, belts, bearings, and controls.',
      triggerType: TriggerType.CALENDAR,
      calendarRule: {
        frequency: 'quarterly',
        advanceNoticeDays: 7,
      },
      taskList: [
        {
          sequence: 1,
          title: 'Replace G4 pre-filters',
          instructions:
            'Replace all G4 pre-filter cassettes. Record static pressure drop before removal.',
          requiresPhoto: true,
          requiresReading: true,
          readingUnit: 'Pa',
          estimatedMinutes: 20,
          isCritical: false,
        },
        {
          sequence: 2,
          title: 'Clean cooling coil',
          instructions:
            'Inspect fin condition. Clean with low-pressure water (max 200 kPa). Do not bend fins.',
          requiresPhoto: true,
          requiresReading: false,
          estimatedMinutes: 30,
          isCritical: false,
        },
        {
          sequence: 3,
          title: 'Inspect & tension V-belt',
          instructions:
            'Measure belt deflection (target: 10-13mm at 22N load). Replace if frayed or cracked.',
          requiresPhoto: false,
          requiresReading: true,
          readingUnit: 'Hz (belt frequency)',
          estimatedMinutes: 15,
          isCritical: true,
        },
        {
          sequence: 4,
          title: 'Grease fan shaft bearings',
          instructions: 'Apply 2 pumps SKF LGHP2 grease to each bearing housing. Wipe away excess.',
          requiresPhoto: false,
          requiresReading: false,
          estimatedMinutes: 10,
          isCritical: false,
        },
      ],
      estimatedHours: '3.00',
      requiredSkills: ['Mechanical', 'Electrical'],
      isActive: true,
      lastTriggered: daysAgo(90),
      nextDue: daysFromNow(2),
      createdById: manager.id,
    },
  })

  await prisma.pMSchedule.create({
    data: {
      tenantId: tenant.id,
      assetId: compressor.id,
      title: 'AC-001 Runtime-Based Oil & Filter Service',
      description:
        'Service every 2,000 runtime hours: oil change, air/oil separator, and inlet filter.',
      triggerType: TriggerType.METER,
      meterRule: {
        meterField: 'runtime_hours',
        interval: 2000,
        tolerance: 50,
        currentReading: 12450,
      },
      taskList: [
        {
          sequence: 1,
          title: 'Drain and replace compressor oil',
          instructions: 'Use Atlas Copco Roto-Inject Fluid or equivalent PAO 46. Capacity: 9L.',
          requiresPhoto: false,
          requiresReading: false,
          estimatedMinutes: 30,
          isCritical: true,
        },
        {
          sequence: 2,
          title: 'Replace air/oil separator element',
          instructions: 'Part: 1613901200. Torque drain plug to 25 Nm.',
          requiresPhoto: false,
          requiresReading: false,
          estimatedMinutes: 20,
          isCritical: true,
        },
        {
          sequence: 3,
          title: 'Replace inlet air filter',
          instructions: 'Part: 1613950400. Check filter housing for cracks.',
          requiresPhoto: false,
          requiresReading: false,
          estimatedMinutes: 10,
          isCritical: false,
        },
      ],
      estimatedHours: '1.50',
      requiredSkills: ['Mechanical'],
      isActive: true,
      nextDue: daysFromNow(14),
      createdById: manager.id,
    },
  })

  // ── 11. Audit logs ────────────────────────────────────────────────────────
  const auditEntries = [
    {
      tenantId: tenant.id,
      userId: manager.id,
      action: 'CREATE_WORK_ORDER',
      entityType: 'WorkOrder',
      entityId: wo1.id,
      after: { woNumber: wo1.woNumber, title: wo1.title, status: wo1.status },
    },
    {
      tenantId: tenant.id,
      userId: tech1.id,
      action: 'UPDATE_WO_STATUS',
      entityType: 'WorkOrder',
      entityId: wo1.id,
      before: { status: WOStatus.OPEN },
      after: { status: WOStatus.IN_PROGRESS },
    },
    {
      tenantId: tenant.id,
      userId: tech1.id,
      action: 'UPDATE_WO_STATUS',
      entityType: 'WorkOrder',
      entityId: wo1.id,
      before: { status: WOStatus.IN_PROGRESS },
      after: { status: WOStatus.COMPLETED, resolution: wo1.resolution },
    },
    {
      tenantId: tenant.id,
      userId: manager.id,
      action: 'CREATE_WORK_ORDER',
      entityType: 'WorkOrder',
      entityId: wo2.id,
      after: { woNumber: wo2.woNumber, title: wo2.title, status: wo2.status },
    },
    {
      tenantId: tenant.id,
      userId: manager.id,
      action: 'CREATE_WORK_ORDER',
      entityType: 'WorkOrder',
      entityId: wo3.id,
      after: {
        woNumber: wo3.woNumber,
        title: wo3.title,
        priority: wo3.priority,
        status: wo3.status,
      },
    },
  ]

  await prisma.auditLog.createMany({ data: auditEntries })

  // ── 12. Summary ───────────────────────────────────────────────────────────
  const counts = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.location.count(),
    prisma.asset.count(),
    prisma.part.count(),
    prisma.workOrder.count(),
    prisma.pMSchedule.count(),
    prisma.auditLog.count(),
  ])

  console.log('\n✅  Seed complete:')
  console.log(`   Tenants:      ${counts[0]}`)
  console.log(`   Users:        ${counts[1]}`)
  console.log(`   Locations:    ${counts[2]}`)
  console.log(`   Assets:       ${counts[3]}`)
  console.log(`   Parts:        ${counts[4]}`)
  console.log(`   Work orders:  ${counts[5]}`)
  console.log(`   PM schedules: ${counts[6]}`)
  console.log(`   Audit logs:   ${counts[7]}`)
  console.log('\n📧  Login credentials (all share Password123!):')
  console.log(`   admin@demo.com   → ADMIN`)
  console.log(`   manager@demo.com → MANAGER`)
  console.log(`   alice@demo.com   → TECHNICIAN`)
  console.log(`   bob@demo.com     → TECHNICIAN`)
  console.log(`   viewer@demo.com  → VIEWER`)
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
