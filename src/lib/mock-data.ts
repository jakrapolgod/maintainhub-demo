// Mock data for MaintainHub demo — comprehensive Thai-factory dataset

// ── Types ─────────────────────────────────────────────────────────────────────
export type AssetStatus = 'OPERATIONAL' | 'UNDER_MAINTENANCE' | 'STANDBY' | 'DECOMMISSIONED'
export type AssetNodeType = 'PLANT' | 'SYSTEM' | 'EQUIPMENT'
export type CriticalityClass = 'A' | 'B' | 'C'
export type WOStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
export type WOPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type WOType = 'CORRECTIVE' | 'PREVENTIVE' | 'INSPECTION' | 'EMERGENCY'
export type PMTriggerType = 'CALENDAR' | 'METER' | 'CONDITION'
export type PMFrequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY'
export type PartCategory = 'Mechanical' | 'Electrical' | 'Consumable'
export type NotificationType =
  | 'SLA_BREACH'
  | 'PM_DUE'
  | 'LOW_STOCK'
  | 'WO_ASSIGNED'
  | 'WO_COMPLETED'
  | 'WO_OVERDUE'
export type UserRole = 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'VIEWER' | 'CONTRACTOR'
export type UserStatus = 'ACTIVE' | 'INACTIVE'

// ── Interfaces ────────────────────────────────────────────────────────────────
export interface Asset {
  id: string
  name: string
  tag: string
  nodeType: AssetNodeType
  parentId?: string
  status: AssetStatus
  criticality: CriticalityClass
  model?: string
  manufacturer?: string
  serialNumber?: string
  location: string
  lastMaintenanceDate?: string
}

export interface LaborEntry {
  date: string
  technicianName: string
  hours: number
  ratePerHour: number
}

export interface PartUsage {
  partNumber: string
  partName: string
  qty: number
  unitCost: number
}

export interface WOComment {
  author: string
  message: string
  createdAt: string
}

export interface WorkOrder {
  id: string
  title: string
  assetId: string
  status: WOStatus
  priority: WOPriority
  type: WOType
  assignedTo: string
  createdAt: string
  dueDate: string
  completedAt?: string
  description?: string
  resolution?: string
  slaBreach?: boolean
  overdue?: boolean
  laborEntries: LaborEntry[]
  partUsages: PartUsage[]
  comments: WOComment[]
}

export interface PMTask {
  step: number
  instruction: string
}

export interface PMSchedule {
  id: string
  title: string
  assetId: string
  triggerType: PMTriggerType
  frequency?: PMFrequency
  meterInterval?: number
  currentMeterValue?: number
  meterUnit?: string
  lastDone: string
  nextDue: string
  isOverdue: boolean
  isActive: boolean
  taskCount: number
  taskList: PMTask[]
  assignedTo: string
  plannedTriggers: number
  actualTriggers: number
  compliancePct: number
  triggerHistory: string[]
}

export interface SparePart {
  partNumber: string
  name: string
  category: PartCategory
  quantity: number
  minStock: number
  unitCost: number
  warehouse: string
  supplier: string
  isLowStock: boolean
}

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  createdAt: string
  isRead: boolean
  link: string
}

export interface TeamUser {
  id: string
  name: string
  email: string
  role: UserRole
  avatar: string
  status: UserStatus
  lastLogin: string
  skills: string[]
}

// ── Asset Hierarchy ───────────────────────────────────────────────────────────
export const assets: Asset[] = [
  // Plant
  {
    id: 'plant-01',
    name: 'โรงงานนครราชสีมา',
    tag: 'NMA-PLANT',
    nodeType: 'PLANT',
    status: 'OPERATIONAL',
    criticality: 'A',
    location: 'นครราชสีมา',
  },
  // Systems
  {
    id: 'sys-cooling',
    name: 'ระบบน้ำหล่อเย็น',
    tag: 'SYS-COOL',
    nodeType: 'SYSTEM',
    parentId: 'plant-01',
    status: 'OPERATIONAL',
    criticality: 'A',
    location: 'อาคาร 1 ชั้น B',
  },
  {
    id: 'sys-compress',
    name: 'ระบบอัดอากาศ',
    tag: 'SYS-COMP',
    nodeType: 'SYSTEM',
    parentId: 'plant-01',
    status: 'UNDER_MAINTENANCE',
    criticality: 'B',
    location: 'อาคาร 1 ชั้น 1',
  },
  {
    id: 'sys-conveyor',
    name: 'ระบบสายพาน',
    tag: 'SYS-CONV',
    nodeType: 'SYSTEM',
    parentId: 'plant-01',
    status: 'OPERATIONAL',
    criticality: 'B',
    location: 'โรงผลิต A',
  },
  {
    id: 'sys-electric',
    name: 'ระบบไฟฟ้า',
    tag: 'SYS-ELEC',
    nodeType: 'SYSTEM',
    parentId: 'plant-01',
    status: 'OPERATIONAL',
    criticality: 'A',
    location: 'ห้องไฟฟ้าหลัก',
  },
  // Cooling sub-assets
  {
    id: 'p-001',
    name: 'Pump P-001',
    tag: 'P-001',
    nodeType: 'EQUIPMENT',
    parentId: 'sys-cooling',
    status: 'OPERATIONAL',
    criticality: 'A',
    model: 'CM5',
    manufacturer: 'Grundfos',
    serialNumber: 'GF-2019-0042',
    location: 'อาคาร 1 ชั้น B',
    lastMaintenanceDate: '2026-04-10',
  },
  {
    id: 'p-002',
    name: 'Pump P-002',
    tag: 'P-002',
    nodeType: 'EQUIPMENT',
    parentId: 'sys-cooling',
    status: 'UNDER_MAINTENANCE',
    criticality: 'A',
    model: 'CM5',
    manufacturer: 'Grundfos',
    serialNumber: 'GF-2019-0043',
    location: 'อาคาร 1 ชั้น B',
    lastMaintenanceDate: '2026-03-20',
  },
  // Compressor sub-assets
  {
    id: 'ac-001',
    name: 'Compressor AC-001',
    tag: 'AC-001',
    nodeType: 'EQUIPMENT',
    parentId: 'sys-compress',
    status: 'OPERATIONAL',
    criticality: 'B',
    model: 'GA15',
    manufacturer: 'Atlas Copco',
    serialNumber: 'AC-2020-1101',
    location: 'อาคาร 1 ชั้น 1',
    lastMaintenanceDate: '2026-02-01',
  },
  {
    id: 'ac-002',
    name: 'Compressor AC-002',
    tag: 'AC-002',
    nodeType: 'EQUIPMENT',
    parentId: 'sys-compress',
    status: 'STANDBY',
    criticality: 'B',
    model: 'GA15',
    manufacturer: 'Atlas Copco',
    serialNumber: 'AC-2020-1102',
    location: 'อาคาร 1 ชั้น 1',
    lastMaintenanceDate: '2026-04-15',
  },
  // Conveyor sub-assets
  {
    id: 'cb-001',
    name: 'Conveyor CB-001',
    tag: 'CB-001',
    nodeType: 'EQUIPMENT',
    parentId: 'sys-conveyor',
    status: 'OPERATIONAL',
    criticality: 'B',
    model: '400',
    manufacturer: 'Interroll',
    serialNumber: 'IR-2021-4401',
    location: 'โรงผลิต A ไลน์ 1',
    lastMaintenanceDate: '2026-04-28',
  },
  {
    id: 'cb-002',
    name: 'Conveyor CB-002',
    tag: 'CB-002',
    nodeType: 'EQUIPMENT',
    parentId: 'sys-conveyor',
    status: 'OPERATIONAL',
    criticality: 'C',
    model: '400',
    manufacturer: 'Interroll',
    serialNumber: 'IR-2021-4402',
    location: 'โรงผลิต A ไลน์ 2',
    lastMaintenanceDate: '2026-04-20',
  },
  // Electrical sub-assets
  {
    id: 'g-001',
    name: 'Generator G-001',
    tag: 'G-001',
    nodeType: 'EQUIPMENT',
    parentId: 'sys-electric',
    status: 'OPERATIONAL',
    criticality: 'A',
    model: 'C150D5',
    manufacturer: 'Cummins',
    serialNumber: 'CM-2018-7751',
    location: 'ห้องเครื่องกำเนิดไฟ',
    lastMaintenanceDate: '2026-04-28',
  },
  {
    id: 't-001',
    name: 'Transformer T-001',
    tag: 'T-001',
    nodeType: 'EQUIPMENT',
    parentId: 'sys-electric',
    status: 'OPERATIONAL',
    criticality: 'A',
    model: '500kVA',
    manufacturer: 'ABB',
    serialNumber: 'ABB-2017-0099',
    location: 'ห้องไฟฟ้าหลัก',
    lastMaintenanceDate: '2026-01-15',
  },
  // Standalone
  {
    id: 'ct-001',
    name: 'Cooling Tower CT-001',
    tag: 'CT-001',
    nodeType: 'EQUIPMENT',
    status: 'OPERATIONAL',
    criticality: 'B',
    model: 'VFL',
    manufacturer: 'BAC',
    serialNumber: 'BAC-2019-0311',
    location: 'ลานด้านเหนือ',
    lastMaintenanceDate: '2026-03-10',
  },
  {
    id: 'hv-001',
    name: 'HVAC Unit HV-001',
    tag: 'HV-001',
    nodeType: 'EQUIPMENT',
    status: 'OPERATIONAL',
    criticality: 'C',
    model: 'VRV IV',
    manufacturer: 'Daikin',
    serialNumber: 'DK-2022-5500',
    location: 'อาคารสำนักงาน',
    lastMaintenanceDate: '2026-02-20',
  },
]

// ── Work Orders ───────────────────────────────────────────────────────────────
export const workOrders: WorkOrder[] = [
  {
    id: 'WO-2024-0001',
    title: 'ปั๊มน้ำ P-001 รั่วซึม น้ำออกทางซีล',
    assetId: 'p-001',
    status: 'IN_PROGRESS',
    priority: 'CRITICAL',
    type: 'EMERGENCY',
    assignedTo: 'u3',
    createdAt: '2026-05-20T06:00:00Z',
    dueDate: '2026-05-20T14:00:00Z',
    slaBreach: true,
    overdue: true,
    description:
      'พบน้ำรั่วออกทางซีลกลของปั๊ม P-001 อัตราการรั่วประมาณ 5 หยด/นาที ต้องหยุดเครื่องและเปลี่ยนซีลทันทีก่อนการผลิตรอบถัดไป',
    laborEntries: [
      { date: '2026-05-20', technicianName: 'สมชาย วงศ์สุวรรณ', hours: 4, ratePerHour: 550 },
      { date: '2026-05-21', technicianName: 'ประสิทธิ์ มณีรัตน์', hours: 3, ratePerHour: 400 },
    ],
    partUsages: [{ partNumber: 'PT-001', partName: 'ซีลปั๊ม Grundfos', qty: 2, unitCost: 450 }],
    comments: [
      {
        author: 'สมชาย วงศ์สุวรรณ',
        message: 'เริ่มถอดชุดซีลแล้ว พบซีลสึกหรออย่างหนัก',
        createdAt: '2026-05-20T09:30:00Z',
      },
      {
        author: 'นิตยา ศรีประเสริฐ',
        message: 'เร่งดำเนินการ การผลิตต้องเริ่มบ่าย 2 โมง',
        createdAt: '2026-05-20T10:00:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0002',
    title: 'เสียงดังผิดปกติจาก AC-001 เมื่อรับภาร 80%',
    assetId: 'ac-001',
    status: 'OPEN',
    priority: 'HIGH',
    type: 'CORRECTIVE',
    assignedTo: 'u5',
    createdAt: '2026-05-21T08:00:00Z',
    dueDate: '2026-05-27T17:00:00Z',
    description: 'ได้ยินเสียงกระทบโลหะเมื่อคอมเพรสเซอร์ทำงานที่ภาร > 80% อาจเป็นปัญหาวาล์วภายใน',
    laborEntries: [
      { date: '2026-05-22', technicianName: 'ประสิทธิ์ มณีรัตน์', hours: 2, ratePerHour: 400 },
    ],
    partUsages: [],
    comments: [
      {
        author: 'ประสิทธิ์ มณีรัตน์',
        message: 'ตรวจด้วย stethoscope พบเสียงดังบริเวณ valve plate',
        createdAt: '2026-05-22T10:15:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0003',
    title: 'PM ประจำเดือน Conveyor CB-001',
    assetId: 'cb-001',
    status: 'COMPLETED',
    priority: 'MEDIUM',
    type: 'PREVENTIVE',
    assignedTo: 'u7',
    createdAt: '2026-05-10T08:00:00Z',
    dueDate: '2026-05-15T17:00:00Z',
    completedAt: '2026-05-14T16:30:00Z',
    description:
      'ทำ PM ประจำเดือนตาม checklist มาตรฐาน ได้แก่ ตรวจสอบแรงตึงสายพาน หล่อลื่น และปรับ alignment',
    resolution: 'ดำเนินการเสร็จครบทุกงาน แรงตึงสายพานปรับได้ 9.8 mm deflection ไม่พบปัญหาผิดปกติ',
    laborEntries: [
      { date: '2026-05-14', technicianName: 'สุภาพร แก้วมณี', hours: 4, ratePerHour: 380 },
    ],
    partUsages: [
      { partNumber: 'PT-002', partName: 'น้ำมันเครื่อง Shell Omala', qty: 2, unitCost: 380 },
    ],
    comments: [
      {
        author: 'สุภาพร แก้วมณี',
        message: 'งาน PM เสร็จสมบูรณ์ สายพานอยู่ในสภาพดี',
        createdAt: '2026-05-14T16:00:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0004',
    title: 'Generator G-001 ไม่ start อัตโนมัติเมื่อไฟดับ',
    assetId: 'g-001',
    status: 'OPEN',
    priority: 'CRITICAL',
    type: 'EMERGENCY',
    assignedTo: 'u3',
    createdAt: '2026-05-22T22:00:00Z',
    dueDate: '2026-05-23T06:00:00Z',
    slaBreach: true,
    overdue: true,
    description:
      'ทดสอบ auto-start เมื่อคืน Generator ไม่ทำงานภายใน 10 วินาที กระทบระบบสำรองไฟฉุกเฉิน ต้องตรวจ ATS และ battery charger',
    laborEntries: [
      { date: '2026-05-23', technicianName: 'วิชัย อุดมสุข', hours: 3, ratePerHour: 500 },
    ],
    partUsages: [],
    comments: [
      {
        author: 'วิชัย อุดมสุข',
        message: 'ตรวจ ATS พบ relay ชำรุด กำลังสั่งอะไหล่',
        createdAt: '2026-05-23T01:30:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0005',
    title: 'ตรวจสอบฉนวน Transformer T-001 ก่อนหน้าฝน',
    assetId: 't-001',
    status: 'OPEN',
    priority: 'HIGH',
    type: 'INSPECTION',
    assignedTo: 'u5',
    createdAt: '2026-05-21T09:00:00Z',
    dueDate: '2026-05-31T17:00:00Z',
    description:
      'ทำ insulation resistance test (Megger) ก่อนเข้าหน้าฝน วัดค่า IR ทุก winding บันทึกค่า PI',
    laborEntries: [],
    partUsages: [],
    comments: [
      {
        author: 'นิตยา ศรีประเสริฐ',
        message: 'นัดกับทีม Electrician วันที่ 28 พ.ค.',
        createdAt: '2026-05-21T11:00:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0006',
    title: 'เปลี่ยนสายพาน V-Belt CB-002',
    assetId: 'cb-002',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    type: 'CORRECTIVE',
    assignedTo: 'u7',
    createdAt: '2026-05-19T10:00:00Z',
    dueDate: '2026-05-26T17:00:00Z',
    description: 'สายพาน B68 ของ CB-002 แตกร้าวที่ขอบ ประสิทธิภาพลดลง ต้องเปลี่ยนชุดสายพาน 2 เส้น',
    laborEntries: [
      { date: '2026-05-22', technicianName: 'สุภาพร แก้วมณี', hours: 5, ratePerHour: 380 },
    ],
    partUsages: [{ partNumber: 'PT-003', partName: 'สายพาน V-Belt B68', qty: 2, unitCost: 280 }],
    comments: [
      {
        author: 'สุภาพร แก้วมณี',
        message: 'ถอดสายพานเก่าออกแล้ว กำลังรอสายพานใหม่จาก Warehouse',
        createdAt: '2026-05-22T14:00:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0007',
    title: 'PM รายไตรมาส Compressor AC-001',
    assetId: 'ac-001',
    status: 'DRAFT',
    priority: 'MEDIUM',
    type: 'PREVENTIVE',
    assignedTo: 'u5',
    createdAt: '2026-05-23T08:00:00Z',
    dueDate: '2026-06-05T17:00:00Z',
    description: 'PM ตามแผน ได้แก่ เปลี่ยนไส้กรองอากาศ เช็คระดับน้ำมัน ทดสอบ safety valve',
    laborEntries: [],
    partUsages: [],
    comments: [],
  },
  {
    id: 'WO-2024-0008',
    title: 'ล้างแผงระบายความร้อน CT-001',
    assetId: 'ct-001',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    type: 'CORRECTIVE',
    assignedTo: 'u7',
    createdAt: '2026-05-18T08:00:00Z',
    dueDate: '2026-05-28T17:00:00Z',
    description:
      'แผงระบายความร้อนของ CT-001 มีตะกรันและสาหร่ายสะสม ประสิทธิภาพลดลง 18% ต้องล้างด้วยสารเคมีและน้ำแรงดันสูง',
    laborEntries: [
      { date: '2026-05-20', technicianName: 'สุภาพร แก้วมณี', hours: 6, ratePerHour: 380 },
      {
        date: '2026-05-21',
        technicianName: 'บริษัท เอ็นจิเนียริ่ง จำกัด',
        hours: 8,
        ratePerHour: 600,
      },
    ],
    partUsages: [
      { partNumber: 'PT-008', partName: 'น้ำยาทำความเย็น R410A', qty: 1, unitCost: 3200 },
    ],
    comments: [
      {
        author: 'สุภาพร แก้วมณี',
        message: 'ล้างเสร็จ 70% ยังเหลือแผงด้านใน',
        createdAt: '2026-05-21T17:00:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0009',
    title: 'ตรวจสอบระบบ PLC Conveyor CB-001',
    assetId: 'cb-001',
    status: 'OPEN',
    priority: 'LOW',
    type: 'INSPECTION',
    assignedTo: 'u6',
    createdAt: '2026-05-22T10:00:00Z',
    dueDate: '2026-06-10T17:00:00Z',
    description: 'อัปเดต firmware PLC และ backup โปรแกรมก่อนปิดซ่อมใหญ่กลางปี',
    laborEntries: [],
    partUsages: [],
    comments: [
      {
        author: 'วิชัย อุดมสุข',
        message: 'จะทำหลังจาก WO-2024-0006 เสร็จ',
        createdAt: '2026-05-22T11:00:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0010',
    title: 'PM รายสัปดาห์ Conveyor CB-001',
    assetId: 'cb-001',
    status: 'COMPLETED',
    priority: 'LOW',
    type: 'PREVENTIVE',
    assignedTo: 'u7',
    createdAt: '2026-05-17T07:00:00Z',
    dueDate: '2026-05-17T12:00:00Z',
    completedAt: '2026-05-17T11:30:00Z',
    description: 'ตรวจสอบรายสัปดาห์ตาม checklist: เสียง การสั่นสะเทือน อุณหภูมิ bearing',
    resolution: 'ทุกรายการอยู่ในเกณฑ์ปกติ อุณหภูมิ bearing สูงสุด 42°C ไม่พบความผิดปกติ',
    laborEntries: [
      { date: '2026-05-17', technicianName: 'สุภาพร แก้วมณี', hours: 2, ratePerHour: 380 },
    ],
    partUsages: [],
    comments: [
      {
        author: 'สุภาพร แก้วมณี',
        message: 'เสร็จเรียบร้อย ทุกอย่างปกติ',
        createdAt: '2026-05-17T11:30:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0011',
    title: 'ตรวจสอบ Megger Test ตู้ไฟฟ้าหลัก',
    assetId: 't-001',
    status: 'DRAFT',
    priority: 'HIGH',
    type: 'INSPECTION',
    assignedTo: 'u6',
    createdAt: '2026-05-23T09:00:00Z',
    dueDate: '2026-06-02T17:00:00Z',
    description: 'วัด insulation resistance ของ cable หลักทุกวงจรก่อนฤดูฝน ตามมาตรฐาน IEC 60364',
    laborEntries: [],
    partUsages: [],
    comments: [],
  },
  {
    id: 'WO-2024-0012',
    title: 'เปลี่ยนน้ำมันเครื่อง Compressor AC-002',
    assetId: 'ac-002',
    status: 'ON_HOLD',
    priority: 'MEDIUM',
    type: 'PREVENTIVE',
    assignedTo: 'u5',
    createdAt: '2026-05-16T09:00:00Z',
    dueDate: '2026-05-30T17:00:00Z',
    description: 'น้ำมัน Atlas Copco Roto-Inject Fluid ถึงกำหนดเปลี่ยน 4000 ชม. รอชิ้นส่วนประกอบ',
    laborEntries: [
      { date: '2026-05-16', technicianName: 'ประสิทธิ์ มณีรัตน์', hours: 1, ratePerHour: 400 },
    ],
    partUsages: [],
    comments: [
      {
        author: 'ประสิทธิ์ มณีรัตน์',
        message: 'รอน้ำมัน Atlas Copco จากซัพพลายเออร์ ETA 27 พ.ค.',
        createdAt: '2026-05-16T11:00:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0013',
    title: 'Grease Bearing Generator G-001',
    assetId: 'g-001',
    status: 'COMPLETED',
    priority: 'LOW',
    type: 'PREVENTIVE',
    assignedTo: 'u6',
    createdAt: '2026-04-28T08:00:00Z',
    dueDate: '2026-04-30T17:00:00Z',
    completedAt: '2026-04-29T15:00:00Z',
    description: 'หล่อลื่น bearing ตามกำหนดทุก 500 ชม. ใช้ Mobil Polyrex EM grease',
    resolution:
      'หล่อลื่นครบทุก bearing ทั้งหมด 4 จุด บันทึกการใช้ grease 200g อุณหภูมิ bearing ก่อน 48°C หลัง 44°C',
    laborEntries: [
      { date: '2026-04-29', technicianName: 'วิชัย อุดมสุข', hours: 2, ratePerHour: 500 },
    ],
    partUsages: [
      { partNumber: 'PT-009', partName: 'จาระบี Polyrex EM 400g', qty: 1, unitCost: 220 },
    ],
    comments: [
      {
        author: 'วิชัย อุดมสุข',
        message: 'เสร็จเรียบร้อย อุณหภูมิลดลงดีมาก',
        createdAt: '2026-04-29T15:00:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0014',
    title: 'ซ่อม Pump P-002 ชุด Impeller',
    assetId: 'p-002',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    type: 'CORRECTIVE',
    assignedTo: 'u3',
    createdAt: '2026-05-15T08:00:00Z',
    dueDate: '2026-05-29T17:00:00Z',
    description:
      'Impeller ของ P-002 สึกหรอจากการ cavitation ประสิทธิภาพลดลง 30% ต้องเปลี่ยน impeller ใหม่',
    laborEntries: [
      { date: '2026-05-19', technicianName: 'ประสิทธิ์ มณีรัตน์', hours: 6, ratePerHour: 400 },
      { date: '2026-05-20', technicianName: 'ประสิทธิ์ มณีรัตน์', hours: 5, ratePerHour: 400 },
    ],
    partUsages: [
      { partNumber: 'PT-004', partName: 'ตลับลูกปืน 6205', qty: 2, unitCost: 650 },
      { partNumber: 'PT-001', partName: 'ซีลปั๊ม Grundfos', qty: 1, unitCost: 450 },
    ],
    comments: [
      {
        author: 'ประสิทธิ์ มณีรัตน์',
        message: 'ถอด impeller ออกแล้ว พบ erosion รุนแรงที่ vane',
        createdAt: '2026-05-19T14:00:00Z',
      },
      {
        author: 'สมชาย วงศ์สุวรรณ',
        message: 'สั่ง impeller ใหม่แล้ว รอส่ง 2-3 วัน',
        createdAt: '2026-05-20T09:00:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0015',
    title: 'ตรวจสอบ Safety Relief Valve ทุกจุด',
    assetId: 'sys-compress',
    status: 'DRAFT',
    priority: 'HIGH',
    type: 'INSPECTION',
    assignedTo: 'u3',
    createdAt: '2026-05-23T10:00:00Z',
    dueDate: '2026-06-07T17:00:00Z',
    description: 'ทดสอบ SRV ทุกตัวในระบบอัดอากาศตามกำหนดรายปี ตาม ASME SEC VIII',
    laborEntries: [],
    partUsages: [],
    comments: [],
  },
  {
    id: 'WO-2024-0016',
    title: 'PM รายเดือน HVAC HV-001',
    assetId: 'hv-001',
    status: 'OPEN',
    priority: 'LOW',
    type: 'PREVENTIVE',
    assignedTo: 'u8',
    createdAt: '2026-05-20T09:00:00Z',
    dueDate: '2026-06-05T17:00:00Z',
    description: 'เปลี่ยน filter และล้างทำความสะอาด coil ทุก 1 เดือน ตามสัญญา Daikin',
    laborEntries: [],
    partUsages: [],
    comments: [
      {
        author: 'อนุชา พรหมสิทธิ์',
        message: 'ประสานงานกับทีม Daikin service แล้ว นัดวันที่ 1 มิ.ย.',
        createdAt: '2026-05-21T09:00:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0017',
    title: 'ตรวจสอบ Load Bank Test Generator G-001',
    assetId: 'g-001',
    status: 'OPEN',
    priority: 'HIGH',
    type: 'INSPECTION',
    assignedTo: 'u6',
    createdAt: '2026-05-22T09:00:00Z',
    dueDate: '2026-06-01T17:00:00Z',
    description:
      'ทดสอบ Load Bank ที่ 100% rated kVA นาน 2 ชั่วโมง บันทึก voltage, frequency, temp ทุก 30 นาที',
    laborEntries: [],
    partUsages: [],
    comments: [
      {
        author: 'นิตยา ศรีประเสริฐ',
        message: 'กำหนดทดสอบ 1 มิ.ย. เวลา 08:00 น. แจ้งฝ่ายผลิตแล้ว',
        createdAt: '2026-05-22T10:00:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0018',
    title: 'ซ่อมแซม Contactor ชุดควบคุม Pump P-001',
    assetId: 'p-001',
    status: 'CANCELLED',
    priority: 'MEDIUM',
    type: 'CORRECTIVE',
    assignedTo: 'u6',
    createdAt: '2026-05-10T09:00:00Z',
    dueDate: '2026-05-15T17:00:00Z',
    description:
      'Contactor ชำรุด แต่ตรวจสอบเพิ่มเติมพบว่าเกิดจากเหตุการณ์เดียวกับ WO-2024-0001 จึงยกเลิก',
    laborEntries: [],
    partUsages: [],
    comments: [
      {
        author: 'สมชาย วงศ์สุวรรณ',
        message: 'ยกเลิก เนื่องจาก root cause เดียวกับ WO-0001',
        createdAt: '2026-05-10T11:00:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0019',
    title: 'ล้างทำความสะอาด Strainer ระบบน้ำหล่อเย็น',
    assetId: 'sys-cooling',
    status: 'ON_HOLD',
    priority: 'MEDIUM',
    type: 'CORRECTIVE',
    assignedTo: 'u3',
    createdAt: '2026-05-18T10:00:00Z',
    dueDate: '2026-05-28T17:00:00Z',
    description: 'Strainer อุดตัน แรงดันน้ำลด ต้องรอ Bypass valve ก่อนทำงาน',
    laborEntries: [
      { date: '2026-05-18', technicianName: 'ประสิทธิ์ มณีรัตน์', hours: 1, ratePerHour: 400 },
    ],
    partUsages: [],
    comments: [
      {
        author: 'ประสิทธิ์ มณีรัตน์',
        message: 'Hold รอ Bypass valve จาก Procurement 3-5 วัน',
        createdAt: '2026-05-18T14:00:00Z',
      },
    ],
  },
  {
    id: 'WO-2024-0020',
    title: 'ตรวจวัด Vibration Compressor AC-001 ทุกเดือน',
    assetId: 'ac-001',
    status: 'DRAFT',
    priority: 'LOW',
    type: 'INSPECTION',
    assignedTo: 'u5',
    createdAt: '2026-05-23T11:00:00Z',
    dueDate: '2026-06-10T17:00:00Z',
    description: 'วัด vibration ด้วย handheld analyzer บันทึกค่า velocity (mm/s) ตาม ISO 10816-3',
    laborEntries: [],
    partUsages: [],
    comments: [],
  },
]

// ── PM Schedules ──────────────────────────────────────────────────────────────
export const pmSchedules: PMSchedule[] = [
  {
    id: 'pm-01',
    title: 'PM รายเดือน ปั๊ม P-001',
    assetId: 'p-001',
    triggerType: 'CALENDAR',
    frequency: 'MONTHLY',
    lastDone: '2026-04-25',
    nextDue: '2026-05-28',
    isOverdue: false,
    isActive: true,
    taskCount: 6,
    assignedTo: 'u3',
    plannedTriggers: 13,
    actualTriggers: 12,
    compliancePct: 92,
    taskList: [
      { step: 1, instruction: 'ตรวจสอบการรั่วซึมของซีลและ gasket' },
      { step: 2, instruction: 'วัดอุณหภูมิ bearing ทั้ง 2 ด้าน (< 70°C)' },
      { step: 3, instruction: 'ตรวจวัดแรงดันและอัตราการไหล เทียบ design point' },
      { step: 4, instruction: 'เช็คระดับการสั่นสะเทือน (< 4.5 mm/s)' },
      { step: 5, instruction: 'หล่อลื่น bearing ตามตาราง' },
      { step: 6, instruction: 'บันทึกผลและถ่ายรูปประกอบ' },
    ],
    triggerHistory: [
      '2026-04-25',
      '2026-03-25',
      '2026-02-25',
      '2026-01-26',
      '2025-12-24',
      '2025-11-25',
    ],
  },
  {
    id: 'pm-02',
    title: 'PM รายไตรมาส Compressor AC-001',
    assetId: 'ac-001',
    triggerType: 'CALENDAR',
    frequency: 'QUARTERLY',
    lastDone: '2026-01-30',
    nextDue: '2026-04-30',
    isOverdue: true,
    isActive: true,
    taskCount: 5,
    assignedTo: 'u5',
    plannedTriggers: 4,
    actualTriggers: 3,
    compliancePct: 75,
    taskList: [
      { step: 1, instruction: 'เปลี่ยนไส้กรองอากาศ Atlas Copco (part# AF-GA15)' },
      { step: 2, instruction: 'ตรวจสอบและเติมน้ำมัน Roto-Inject Fluid' },
      { step: 3, instruction: 'ทดสอบ Safety Relief Valve ที่ set pressure' },
      { step: 4, instruction: 'ล้างทำความสะอาด after-cooler' },
      { step: 5, instruction: 'ตรวจสอบ belt และ coupling alignment' },
    ],
    triggerHistory: [
      '2026-01-30',
      '2025-10-28',
      '2025-07-30',
      '2025-04-29',
      '2025-01-28',
      '2024-10-30',
    ],
  },
  {
    id: 'pm-03',
    title: 'PM ตามชั่วโมงเดิน Generator G-001',
    assetId: 'g-001',
    triggerType: 'METER',
    meterInterval: 250,
    currentMeterValue: 1842,
    meterUnit: 'ชั่วโมง',
    lastDone: '2026-04-28',
    nextDue: '2026-06-15',
    isOverdue: false,
    isActive: true,
    taskCount: 6,
    assignedTo: 'u6',
    plannedTriggers: 7,
    actualTriggers: 6,
    compliancePct: 88,
    taskList: [
      { step: 1, instruction: 'เปลี่ยนน้ำมันเครื่องและกรองน้ำมัน (Cummins OEM)' },
      { step: 2, instruction: 'ตรวจสอบ coolant level และ concentration' },
      { step: 3, instruction: 'ทดสอบ battery และ charger ของ starting system' },
      { step: 4, instruction: 'ตรวจสอบ fuel system: กรอง, สาย, ระดับน้ำมัน' },
      { step: 5, instruction: 'รัน no-load test 15 นาที บันทึก voltage/frequency' },
      { step: 6, instruction: 'รีเซ็ต hour meter alarm ถ้าจำเป็น' },
    ],
    triggerHistory: [
      '2026-04-28',
      '2026-02-10',
      '2025-11-20',
      '2025-09-01',
      '2025-06-15',
      '2025-03-28',
    ],
  },
  {
    id: 'pm-04',
    title: 'ตรวจสอบรายสัปดาห์ Conveyor CB-001',
    assetId: 'cb-001',
    triggerType: 'CALENDAR',
    frequency: 'WEEKLY',
    lastDone: '2026-05-17',
    nextDue: '2026-05-26',
    isOverdue: false,
    isActive: true,
    taskCount: 4,
    assignedTo: 'u7',
    plannedTriggers: 52,
    actualTriggers: 49,
    compliancePct: 95,
    taskList: [
      { step: 1, instruction: 'ฟังเสียงผิดปกติระหว่างการทำงาน' },
      { step: 2, instruction: 'ตรวจสอบแรงตึงสายพาน (deflection 8-12 mm)' },
      { step: 3, instruction: 'ตรวจ roller และ idler ว่า rotate อิสระ' },
      { step: 4, instruction: 'เช็ค emergency stop และ belt-slip sensor' },
    ],
    triggerHistory: [
      '2026-05-17',
      '2026-05-10',
      '2026-05-03',
      '2026-04-26',
      '2026-04-19',
      '2026-04-12',
    ],
  },
  {
    id: 'pm-05',
    title: 'PM รายปี Transformer T-001',
    assetId: 't-001',
    triggerType: 'CALENDAR',
    frequency: 'ANNUALLY',
    lastDone: '2026-01-15',
    nextDue: '2026-07-09',
    isOverdue: false,
    isActive: true,
    taskCount: 5,
    assignedTo: 'u6',
    plannedTriggers: 1,
    actualTriggers: 1,
    compliancePct: 100,
    taskList: [
      { step: 1, instruction: 'วัด Insulation Resistance ทุก winding ด้วย 5kV Megger' },
      { step: 2, instruction: 'ตรวจสอบ oil level และสี (ต้องไม่มีตะกอนหรือฟอง)' },
      { step: 3, instruction: 'ตรวจสอบ bushing, tap changer, และ cooling fins' },
      { step: 4, instruction: 'วัด winding resistance เปรียบเทียบ factory record' },
      { step: 5, instruction: 'ทดสอบ Buchholz relay และ temperature alarm' },
    ],
    triggerHistory: [
      '2026-01-15',
      '2025-01-14',
      '2024-01-16',
      '2023-01-12',
      '2022-01-18',
      '2021-01-15',
    ],
  },
  {
    id: 'pm-06',
    title: 'PM รายเดือน Cooling Tower CT-001',
    assetId: 'ct-001',
    triggerType: 'CALENDAR',
    frequency: 'MONTHLY',
    lastDone: '2026-04-15',
    nextDue: '2026-05-15',
    isOverdue: true,
    isActive: true,
    taskCount: 5,
    assignedTo: 'u7',
    plannedTriggers: 13,
    actualTriggers: 10,
    compliancePct: 78,
    taskList: [
      { step: 1, instruction: 'ตรวจสอบและล้าง strainer / drift eliminator' },
      { step: 2, instruction: 'วัดค่า TDS, pH, conductivity ของน้ำในบ่อ' },
      { step: 3, instruction: 'เติมสารเคมีป้องกันตะกรันและการกัดกร่อน' },
      { step: 4, instruction: 'ตรวจสอบ fan belt และ gear box' },
      { step: 5, instruction: 'วัด approach temperature และบันทึก' },
    ],
    triggerHistory: [
      '2026-04-15',
      '2026-03-14',
      '2026-02-14',
      '2026-01-15',
      '2025-12-14',
      '2025-11-15',
    ],
  },
  {
    id: 'pm-07',
    title: 'Vibration Analysis Pump P-002',
    assetId: 'p-002',
    triggerType: 'CALENDAR',
    frequency: 'MONTHLY',
    lastDone: '2026-03-20',
    nextDue: '2026-04-20',
    isOverdue: true,
    isActive: true,
    taskCount: 4,
    assignedTo: 'u3',
    plannedTriggers: 4,
    actualTriggers: 3,
    compliancePct: 75,
    taskList: [
      { step: 1, instruction: 'วัด vibration velocity ทุก bearing point ด้วย CSI 2140' },
      { step: 2, instruction: 'เปรียบเทียบ spectrum กับ baseline' },
      { step: 3, instruction: 'บันทึกผลและ trend ใน system' },
      { step: 4, instruction: 'แจ้ง supervisor ถ้าค่าเกิน alarm level (7.1 mm/s)' },
    ],
    triggerHistory: [
      '2026-03-20',
      '2026-02-19',
      '2026-01-21',
      '2025-12-20',
      '2025-11-19',
      '2025-10-21',
    ],
  },
  {
    id: 'pm-08',
    title: 'PM รายไตรมาส Conveyor CB-002',
    assetId: 'cb-002',
    triggerType: 'CALENDAR',
    frequency: 'QUARTERLY',
    lastDone: '2026-02-20',
    nextDue: '2026-05-21',
    isOverdue: true,
    isActive: true,
    taskCount: 5,
    assignedTo: 'u7',
    plannedTriggers: 4,
    actualTriggers: 4,
    compliancePct: 100,
    taskList: [
      { step: 1, instruction: 'ตรวจสอบ alignment ของ head และ tail pulley' },
      { step: 2, instruction: 'วัดความหนาของ belt และ lagging' },
      { step: 3, instruction: 'หล่อลื่น bearing ทุกจุด' },
      { step: 4, instruction: 'ตรวจสอบ chute และ skirt rubber' },
      { step: 5, instruction: 'ทดสอบระบบ control และ safety' },
    ],
    triggerHistory: [
      '2026-02-20',
      '2025-11-21',
      '2025-08-22',
      '2025-05-20',
      '2025-02-18',
      '2024-11-19',
    ],
  },
  {
    id: 'pm-09',
    title: 'ตรวจสอบ HVAC HV-001 รายเดือน',
    assetId: 'hv-001',
    triggerType: 'CALENDAR',
    frequency: 'MONTHLY',
    lastDone: '2026-04-25',
    nextDue: '2026-05-25',
    isOverdue: false,
    isActive: true,
    taskCount: 4,
    assignedTo: 'u8',
    plannedTriggers: 13,
    actualTriggers: 13,
    compliancePct: 100,
    taskList: [
      { step: 1, instruction: 'เปลี่ยน/ล้าง air filter ตาม Daikin specification' },
      { step: 2, instruction: 'ล้างทำความสะอาด indoor coil ด้วย foam cleaner' },
      { step: 3, instruction: 'ตรวจสอบ drainage tray และ drain pipe' },
      { step: 4, instruction: 'วัด operating current เทียบกับ nameplate' },
    ],
    triggerHistory: [
      '2026-04-25',
      '2026-03-26',
      '2026-02-25',
      '2026-01-24',
      '2025-12-26',
      '2025-11-25',
    ],
  },
  {
    id: 'pm-10',
    title: 'PM ตามชั่วโมงเดิน Compressor AC-002',
    assetId: 'ac-002',
    triggerType: 'METER',
    meterInterval: 500,
    currentMeterValue: 4320,
    meterUnit: 'ชั่วโมง',
    lastDone: '2026-04-15',
    nextDue: '2026-07-10',
    isOverdue: false,
    isActive: true,
    taskCount: 5,
    assignedTo: 'u5',
    plannedTriggers: 8,
    actualTriggers: 7,
    compliancePct: 88,
    taskList: [
      { step: 1, instruction: 'เปลี่ยนน้ำมัน Atlas Copco Roto-Inject Fluid' },
      { step: 2, instruction: 'เปลี่ยน oil separator element' },
      { step: 3, instruction: 'เปลี่ยน air/oil filter element' },
      { step: 4, instruction: 'ตรวจสอบ thermostatic valve' },
      { step: 5, instruction: 'ล้าง cooler และตรวจ fan' },
    ],
    triggerHistory: [
      '2026-04-15',
      '2025-11-20',
      '2025-06-30',
      '2025-01-10',
      '2024-08-05',
      '2024-02-20',
    ],
  },
]

// ── Spare Parts ───────────────────────────────────────────────────────────────
export const spareParts: SparePart[] = [
  {
    partNumber: 'PT-001',
    name: 'ซีลปั๊ม Grundfos CM5',
    category: 'Mechanical',
    quantity: 8,
    minStock: 5,
    unitCost: 450,
    warehouse: 'Warehouse-A',
    supplier: 'Grundfos Thailand',
    isLowStock: false,
  },
  {
    partNumber: 'PT-002',
    name: 'น้ำมันเครื่อง Shell Omala 220',
    category: 'Consumable',
    quantity: 24,
    minStock: 10,
    unitCost: 380,
    warehouse: 'Warehouse-A',
    supplier: 'Shell Thailand',
    isLowStock: false,
  },
  {
    partNumber: 'PT-003',
    name: 'สายพาน V-Belt B68',
    category: 'Mechanical',
    quantity: 3,
    minStock: 5,
    unitCost: 280,
    warehouse: 'Warehouse-B',
    supplier: 'Gates Rubber Thailand',
    isLowStock: true,
  },
  {
    partNumber: 'PT-004',
    name: 'ตลับลูกปืน 6205 ZZ',
    category: 'Mechanical',
    quantity: 12,
    minStock: 8,
    unitCost: 650,
    warehouse: 'Warehouse-A',
    supplier: 'NSK Thailand',
    isLowStock: false,
  },
  {
    partNumber: 'PT-005',
    name: 'ฟิวส์ 63A NH00',
    category: 'Electrical',
    quantity: 2,
    minStock: 10,
    unitCost: 120,
    warehouse: 'Warehouse-C',
    supplier: 'Siemens Thailand',
    isLowStock: true,
  },
  {
    partNumber: 'PT-006',
    name: 'ไส้กรองอากาศ Atlas Copco GA15',
    category: 'Mechanical',
    quantity: 6,
    minStock: 4,
    unitCost: 890,
    warehouse: 'Warehouse-B',
    supplier: 'Atlas Copco Thailand',
    isLowStock: false,
  },
  {
    partNumber: 'PT-007',
    name: 'คอนแทคเตอร์ LC1D40 40A',
    category: 'Electrical',
    quantity: 4,
    minStock: 3,
    unitCost: 1250,
    warehouse: 'Warehouse-C',
    supplier: 'Schneider Electric TH',
    isLowStock: false,
  },
  {
    partNumber: 'PT-008',
    name: 'น้ำยาทำความเย็น R410A (kg)',
    category: 'Consumable',
    quantity: 1,
    minStock: 3,
    unitCost: 3200,
    warehouse: 'Warehouse-B',
    supplier: 'Daikin Thailand',
    isLowStock: true,
  },
  {
    partNumber: 'PT-009',
    name: 'จาระบี Mobil Polyrex EM 400g',
    category: 'Consumable',
    quantity: 20,
    minStock: 8,
    unitCost: 220,
    warehouse: 'Warehouse-A',
    supplier: 'ExxonMobil Thailand',
    isLowStock: false,
  },
  {
    partNumber: 'PT-010',
    name: 'Relay Timer 24VDC',
    category: 'Electrical',
    quantity: 6,
    minStock: 4,
    unitCost: 890,
    warehouse: 'Warehouse-C',
    supplier: 'Omron Thailand',
    isLowStock: false,
  },
  {
    partNumber: 'PT-011',
    name: 'O-Ring NBR 50×3',
    category: 'Mechanical',
    quantity: 30,
    minStock: 20,
    unitCost: 45,
    warehouse: 'Warehouse-A',
    supplier: 'NOK Thailand',
    isLowStock: false,
  },
  {
    partNumber: 'PT-012',
    name: 'Pressure Gauge 0-16 bar',
    category: 'Mechanical',
    quantity: 5,
    minStock: 3,
    unitCost: 780,
    warehouse: 'Warehouse-C',
    supplier: 'Wika Thailand',
    isLowStock: false,
  },
  {
    partNumber: 'PT-013',
    name: 'ผ้ากรองน้ำมัน Cummins C150',
    category: 'Consumable',
    quantity: 4,
    minStock: 2,
    unitCost: 1100,
    warehouse: 'Warehouse-B',
    supplier: 'Cummins Thailand',
    isLowStock: false,
  },
  {
    partNumber: 'PT-014',
    name: 'Cable NYY 4×16mm² (เมตร)',
    category: 'Electrical',
    quantity: 50,
    minStock: 20,
    unitCost: 185,
    warehouse: 'Warehouse-C',
    supplier: 'Thai Cable',
    isLowStock: false,
  },
  {
    partNumber: 'PT-015',
    name: 'Interlock Safety Switch',
    category: 'Electrical',
    quantity: 2,
    minStock: 2,
    unitCost: 2800,
    warehouse: 'Warehouse-C',
    supplier: 'Omron Thailand',
    isLowStock: false,
  },
]

// ── Notifications ─────────────────────────────────────────────────────────────
export const notifications: Notification[] = [
  {
    id: 'n-01',
    type: 'SLA_BREACH',
    title: 'SLA เกินกำหนด – WO-2024-0001',
    message: 'WO-2024-0001 เกิน SLA แล้ว 2 ชั่วโมง ปั๊มน้ำ P-001 ยังอยู่ระหว่างซ่อม',
    createdAt: '2026-05-20T16:00:00Z',
    isRead: false,
    link: '/work-orders/WO-2024-0001',
  },
  {
    id: 'n-02',
    type: 'PM_DUE',
    title: 'PM เลยกำหนด – AC-001 รายไตรมาส',
    message: 'PM รายไตรมาส Compressor AC-001 เลยกำหนดมาแล้ว 25 วัน โปรดดำเนินการ',
    createdAt: '2026-05-23T08:00:00Z',
    isRead: false,
    link: '/pm-schedules/pm-02',
  },
  {
    id: 'n-03',
    type: 'LOW_STOCK',
    title: 'สินค้าใกล้หมด – PT-003 สายพาน V-Belt',
    message: 'PT-003 สายพาน V-Belt B68 เหลือเพียง 3 ชิ้น ต่ำกว่า minimum 5 ชิ้น กรุณาสั่งซื้อ',
    createdAt: '2026-05-22T10:00:00Z',
    isRead: false,
    link: '/inventory',
  },
  {
    id: 'n-04',
    type: 'WO_ASSIGNED',
    title: 'ได้รับมอบหมายงานใหม่ – WO-2024-0005',
    message: 'คุณได้รับมอบหมาย WO-2024-0005 ตรวจสอบฉนวน Transformer T-001 กำหนดส่ง 31 พ.ค.',
    createdAt: '2026-05-21T09:05:00Z',
    isRead: false,
    link: '/work-orders/WO-2024-0005',
  },
  {
    id: 'n-05',
    type: 'LOW_STOCK',
    title: 'สินค้าใกล้หมด – PT-005 ฟิวส์ 63A',
    message: 'PT-005 ฟิวส์ NH00 63A เหลือเพียง 2 ชิ้น ต่ำกว่า minimum 10 ชิ้น อย่างมาก',
    createdAt: '2026-05-22T11:30:00Z',
    isRead: false,
    link: '/inventory',
  },
  {
    id: 'n-06',
    type: 'WO_COMPLETED',
    title: 'งานเสร็จสมบูรณ์ – WO-2024-0003',
    message: 'WO-2024-0003 PM รายเดือน Conveyor CB-001 เสร็จสมบูรณ์โดย สุภาพร แก้วมณี',
    createdAt: '2026-05-14T16:35:00Z',
    isRead: true,
    link: '/work-orders/WO-2024-0003',
  },
  {
    id: 'n-07',
    type: 'SLA_BREACH',
    title: 'SLA เกินกำหนด – WO-2024-0004',
    message: 'Generator G-001 ไม่ start อัตโนมัติ เกิน SLA ฉุกเฉิน 4 ชั่วโมงแล้ว',
    createdAt: '2026-05-23T02:00:00Z',
    isRead: true,
    link: '/work-orders/WO-2024-0004',
  },
  {
    id: 'n-08',
    type: 'LOW_STOCK',
    title: 'สินค้าใกล้หมด – PT-008 น้ำยา R410A',
    message: 'PT-008 น้ำยาทำความเย็น R410A เหลือ 1 kg ต่ำกว่า minimum 3 kg',
    createdAt: '2026-05-21T14:00:00Z',
    isRead: true,
    link: '/inventory',
  },
  {
    id: 'n-09',
    type: 'PM_DUE',
    title: 'PM ถึงกำหนดพรุ่งนี้ – CB-001 รายสัปดาห์',
    message: 'PM รายสัปดาห์ Conveyor CB-001 ถึงกำหนดพรุ่งนี้ 26 พ.ค. โปรดเตรียมทีม',
    createdAt: '2026-05-25T07:00:00Z',
    isRead: true,
    link: '/pm-schedules/pm-04',
  },
  {
    id: 'n-10',
    type: 'WO_ASSIGNED',
    title: 'ได้รับมอบหมายงานใหม่ – WO-2024-0017',
    message: 'คุณได้รับมอบหมาย WO-2024-0017 Load Bank Test Generator G-001 กำหนด 1 มิ.ย.',
    createdAt: '2026-05-22T09:10:00Z',
    isRead: true,
    link: '/work-orders/WO-2024-0017',
  },
  {
    id: 'n-11',
    type: 'WO_COMPLETED',
    title: 'งานเสร็จสมบูรณ์ – WO-2024-0013',
    message: 'WO-2024-0013 Grease Bearing Generator G-001 เสร็จสมบูรณ์โดย วิชัย อุดมสุข',
    createdAt: '2026-04-29T15:05:00Z',
    isRead: true,
    link: '/work-orders/WO-2024-0013',
  },
  {
    id: 'n-12',
    type: 'PM_DUE',
    title: 'PM เลยกำหนด – CT-001 รายเดือน',
    message: 'PM รายเดือน Cooling Tower CT-001 เลยกำหนดมาแล้ว 10 วัน',
    createdAt: '2026-05-25T08:00:00Z',
    isRead: true,
    link: '/pm-schedules/pm-06',
  },
]

// ── Team Users ─────────────────────────────────────────────────────────────────
export const teamUsers: TeamUser[] = [
  {
    id: 'u1',
    name: 'สมชาย วงศ์สุวรรณ',
    email: 'admin@maintainhub.demo',
    role: 'ADMIN',
    avatar: 'สว',
    status: 'ACTIVE',
    lastLogin: '2026-05-25T08:00:00Z',
    skills: ['การจัดการ', 'วางแผนการผลิต', 'ISO 55001'],
  },
  {
    id: 'u2',
    name: 'นิตยา ศรีประเสริฐ',
    email: 'manager@maintainhub.demo',
    role: 'MANAGER',
    avatar: 'นศ',
    status: 'ACTIVE',
    lastLogin: '2026-05-25T07:45:00Z',
    skills: ['วางแผน', 'ควบคุมคุณภาพ', 'รายงาน'],
  },
  {
    id: 'u3',
    name: 'ประสิทธิ์ มณีรัตน์',
    email: 'tech1@maintainhub.demo',
    role: 'TECHNICIAN',
    avatar: 'ปม',
    status: 'ACTIVE',
    lastLogin: '2026-05-25T06:30:00Z',
    skills: ['ระบบไฮดรอลิก', 'ปั๊ม', 'คอมเพรสเซอร์'],
  },
  {
    id: 'u4',
    name: 'วิชัย อุดมสุข',
    email: 'tech2@maintainhub.demo',
    role: 'TECHNICIAN',
    avatar: 'วอ',
    status: 'ACTIVE',
    lastLogin: '2026-05-24T17:00:00Z',
    skills: ['ระบบไฟฟ้า', 'PLC', 'อินเวอร์เตอร์'],
  },
  {
    id: 'u5',
    name: 'สุภาพร แก้วมณี',
    email: 'tech3@maintainhub.demo',
    role: 'TECHNICIAN',
    avatar: 'สก',
    status: 'ACTIVE',
    lastLogin: '2026-05-25T07:00:00Z',
    skills: ['สายพาน', 'เครื่องจักร', 'PM'],
  },
  {
    id: 'u6',
    name: 'อนุชา พรหมสิทธิ์',
    email: 'viewer@maintainhub.demo',
    role: 'VIEWER',
    avatar: 'อพ',
    status: 'ACTIVE',
    lastLogin: '2026-05-23T14:00:00Z',
    skills: [],
  },
  {
    id: 'u7',
    name: 'บริษัท เอ็นจิเนียริ่ง จำกัด',
    email: 'contractor@ext.demo',
    role: 'CONTRACTOR',
    avatar: 'บจ',
    status: 'ACTIVE',
    lastLogin: '2026-05-20T09:00:00Z',
    skills: ['งานเชื่อม', 'ท่อ', 'โครงสร้าง'],
  },
  {
    id: 'u8',
    name: 'ปิยะ ตันติกุล',
    email: 'manager2@maintainhub.demo',
    role: 'MANAGER',
    avatar: 'ปต',
    status: 'ACTIVE',
    lastLogin: '2026-05-24T16:30:00Z',
    skills: ['ความปลอดภัย', 'ISO 45001', 'ตรวจสอบ'],
  },
]

// ── Analytics ─────────────────────────────────────────────────────────────────
export interface MonthlyWOVolume {
  month: string
  corrective: number
  preventive: number
  inspection: number
}
export interface AssetReliability {
  assetId: string
  mtbfHours: number
  mttrHours: number
  availabilityPct: number
  totalCostThisYear: number
}
export interface MttrTrendPoint {
  week: string
  avgHours: number
}

export const monthlyWOVolume: MonthlyWOVolume[] = [
  { month: 'มิ.ย. 68', corrective: 5, preventive: 8, inspection: 3 },
  { month: 'ก.ค. 68', corrective: 7, preventive: 7, inspection: 4 },
  { month: 'ส.ค. 68', corrective: 9, preventive: 8, inspection: 3 },
  { month: 'ก.ย. 68', corrective: 6, preventive: 9, inspection: 5 },
  { month: 'ต.ค. 68', corrective: 8, preventive: 7, inspection: 4 },
  { month: 'พ.ย. 68', corrective: 4, preventive: 8, inspection: 3 },
  { month: 'ธ.ค. 68', corrective: 6, preventive: 9, inspection: 2 },
  { month: 'ม.ค. 69', corrective: 5, preventive: 8, inspection: 4 },
  { month: 'ก.พ. 69', corrective: 7, preventive: 7, inspection: 3 },
  { month: 'มี.ค. 69', corrective: 8, preventive: 8, inspection: 5 },
  { month: 'เม.ย. 69', corrective: 6, preventive: 9, inspection: 4 },
  { month: 'พ.ค. 69', corrective: 9, preventive: 6, inspection: 5 },
]

export const assetReliability: AssetReliability[] = [
  {
    assetId: 'p-001',
    mtbfHours: 1240,
    mttrHours: 4.2,
    availabilityPct: 99.7,
    totalCostThisYear: 38500,
  },
  {
    assetId: 'p-002',
    mtbfHours: 890,
    mttrHours: 6.8,
    availabilityPct: 98.9,
    totalCostThisYear: 52000,
  },
  {
    assetId: 'ac-001',
    mtbfHours: 2100,
    mttrHours: 8.5,
    availabilityPct: 99.6,
    totalCostThisYear: 29800,
  },
  {
    assetId: 'ac-002',
    mtbfHours: 2340,
    mttrHours: 5.1,
    availabilityPct: 99.8,
    totalCostThisYear: 18200,
  },
  {
    assetId: 'cb-001',
    mtbfHours: 3200,
    mttrHours: 3.2,
    availabilityPct: 99.9,
    totalCostThisYear: 15600,
  },
  {
    assetId: 'g-001',
    mtbfHours: 4500,
    mttrHours: 6.0,
    availabilityPct: 99.9,
    totalCostThisYear: 42100,
  },
  {
    assetId: 't-001',
    mtbfHours: 8760,
    mttrHours: 12.0,
    availabilityPct: 100,
    totalCostThisYear: 8900,
  },
  {
    assetId: 'ct-001',
    mtbfHours: 1800,
    mttrHours: 5.5,
    availabilityPct: 99.7,
    totalCostThisYear: 22400,
  },
]

export const costBreakdown = { labor: 284500, parts: 156800, contractor: 89200 }

export const mttrTrend: MttrTrendPoint[] = [
  { week: 'สัปดาห์ที่ 1', avgHours: 7.2 },
  { week: 'สัปดาห์ที่ 2', avgHours: 6.8 },
  { week: 'สัปดาห์ที่ 3', avgHours: 8.1 },
  { week: 'สัปดาห์ที่ 4', avgHours: 7.5 },
  { week: 'สัปดาห์ที่ 5', avgHours: 6.2 },
  { week: 'สัปดาห์ที่ 6', avgHours: 5.9 },
  { week: 'สัปดาห์ที่ 7', avgHours: 6.5 },
  { week: 'สัปดาห์ที่ 8', avgHours: 5.4 },
  { week: 'สัปดาห์ที่ 9', avgHours: 6.8 },
  { week: 'สัปดาห์ที่ 10', avgHours: 7.1 },
  { week: 'สัปดาห์ที่ 11', avgHours: 5.8 },
  { week: 'สัปดาห์ที่ 12', avgHours: 5.2 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
export const getUserById = (id: string) => teamUsers.find((u) => u.id === id)
export const getAssetById = (id: string) => assets.find((a) => a.id === id)
export const getPartByNum = (pn: string) => spareParts.find((p) => p.partNumber === pn)

// Legacy User type alias (for backward compatibility)
export type User = TeamUser
export const users = teamUsers
