// Mock data for MaintainHub demo

export type AssetStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE";
export type CriticalityClass = "A" | "B" | "C";
export type WOStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED";
export type WOPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type PMFrequency = "MONTHLY" | "QUARTERLY";
export type PMType = "CALENDAR" | "METER" | "CONDITION";
export type UserRole = "ADMIN" | "MANAGER" | "TECHNICIAN";

export interface Asset {
  id: string;
  name: string;
  tag: string;
  status: AssetStatus;
  criticality: CriticalityClass;
  location: string;
  lastMaintenanceDate: string;
}

export interface WorkOrder {
  id: string;
  title: string;
  assetId: string;
  status: WOStatus;
  priority: WOPriority;
  assignedTo: string;
  createdAt: string;
  dueDate: string;
  completedAt?: string;
  description?: string;
  resolution?: string;
}

export interface PMSchedule {
  id: string;
  title: string;
  assetId: string;
  type: PMType;
  frequency: PMFrequency;
  lastDone: string;
  nextDue: string;
  isOverdue: boolean;
  isActive: boolean;
  taskCount: number;
  assignedTo: string;
  plannedTriggers: number;
  actualTriggers: number;
  compliancePct: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarInitials: string;
}

// ── Assets ────────────────────────────────────────────────────────────────────
export const assets: Asset[] = [
  { id: "a1", name: "Pump P-001",          tag: "P-001",  status: "ACTIVE",      criticality: "A", location: "Building 1 – Floor 1",  lastMaintenanceDate: "2026-04-10" },
  { id: "a2", name: "Compressor AC-002",   tag: "AC-002", status: "MAINTENANCE", criticality: "B", location: "Building 1 – Roof",      lastMaintenanceDate: "2026-03-22" },
  { id: "a3", name: "Conveyor CB-003",     tag: "CB-003", status: "ACTIVE",      criticality: "B", location: "Warehouse A",            lastMaintenanceDate: "2026-02-14" },
  { id: "a4", name: "Cooling Tower CT-004",tag: "CT-004", status: "ACTIVE",      criticality: "C", location: "External – North Yard",  lastMaintenanceDate: "2026-01-30" },
  { id: "a5", name: "Generator G-001",     tag: "G-001",  status: "ACTIVE",      criticality: "A", location: "Building 2 – Basement",  lastMaintenanceDate: "2026-04-28" },
];

// ── Work Orders ───────────────────────────────────────────────────────────────
export const workOrders: WorkOrder[] = [
  { id: "wo1", title: "Replace mechanical seal",       assetId: "a1", status: "OPEN",        priority: "CRITICAL", assignedTo: "u3", createdAt: "2026-05-20", dueDate: "2026-05-23", description: "Pump P-001 mechanical seal is showing visible leakage at the stuffing box. Coolant is pooling on the base plate. Seal must be replaced before the next production run to prevent pump failure and contamination." },
  { id: "wo2", title: "Lubricate drive belt",          assetId: "a3", status: "OPEN",        priority: "MEDIUM",   assignedTo: "u3", createdAt: "2026-05-18", dueDate: "2026-05-30", description: "Conveyor CB-003 drive belt tension and lubrication are due per the quarterly schedule. Inspect for wear, apply approved belt dressing, and re-tension to spec (± 5 mm deflection)." },
  { id: "wo3", title: "Inspect pressure relief valve", assetId: "a2", status: "IN_PROGRESS", priority: "HIGH",     assignedTo: "u3", createdAt: "2026-05-15", dueDate: "2026-05-25", description: "Compressor AC-002 pressure relief valve (PRV-12) failed its last bench test at 85 % of set pressure. Disassemble, inspect spring and seat, recalibrate to 150 psi, and document results." },
  { id: "wo4", title: "Clean condenser coils",         assetId: "a4", status: "IN_PROGRESS", priority: "MEDIUM",   assignedTo: "u3", createdAt: "2026-05-12", dueDate: "2026-05-28", description: "Cooling Tower CT-004 condenser coils have accumulated scale and biological growth reducing heat-transfer efficiency by an estimated 18 %. Chemical flush and high-pressure rinse required." },
  { id: "wo5", title: "Load test under full capacity", assetId: "a5", status: "OPEN",        priority: "HIGH",     assignedTo: "u2", createdAt: "2026-05-21", dueDate: "2026-06-01", description: "Generator G-001 is scheduled for its semi-annual full-load test (100 % rated kVA for 2 hours). Record voltage, frequency, oil pressure, and temperature at 30-min intervals per IEC 60034-2." },
  { id: "wo6", title: "Replace air filter cartridge",  assetId: "a2", status: "COMPLETED",   priority: "LOW",      assignedTo: "u3", createdAt: "2026-04-20", dueDate: "2026-04-25", completedAt: "2026-04-24", description: "Compressor AC-002 inlet air filter cartridge has reached its 500-hour replacement interval. Replace with OEM part #AC-FILTER-02 and reset the hour meter.", resolution: "Filter cartridge replaced with OEM part #AC-FILTER-02. Hour meter reset to zero. Differential pressure across new filter confirmed at 0.4 kPa. No issues found." },
  { id: "wo7", title: "Calibrate flow sensor",         assetId: "a1", status: "COMPLETED",   priority: "MEDIUM",   assignedTo: "u3", createdAt: "2026-04-10", dueDate: "2026-04-18", completedAt: "2026-04-17", description: "Pump P-001 ultrasonic flow sensor FS-07 is reading 6 % above the reference meter. Recalibrate per manufacturer procedure and update the SCADA tag offset.", resolution: "Flow sensor FS-07 recalibrated using portable reference meter. Zero and span adjusted; final deviation < 0.5 %. SCADA tag P001_FLOW offset updated from +6 % to 0 %." },
  { id: "wo8", title: "Tighten conveyor tensioner",    assetId: "a3", status: "COMPLETED",   priority: "HIGH",     assignedTo: "u3", createdAt: "2026-03-28", dueDate: "2026-04-02", completedAt: "2026-04-01", description: "Conveyor CB-003 belt slipped under load twice in the past week, triggering belt-slip alarms. Inspect tail pulley tensioner, adjust take-up to restore 10 mm deflection, and check pulley lagging.", resolution: "Tail pulley take-up adjusted; deflection restored to 9.8 mm. Lagging showed 30 % wear — flagged for replacement in next planned shutdown. Belt-slip alarms cleared; conveyor ran 4 hours without incident." },
];

// ── PM Schedules ──────────────────────────────────────────────────────────────
export const pmSchedules: PMSchedule[] = [
  { id: "pm1", title: "Monthly pump inspection",       assetId: "a1", type: "CALENDAR",  frequency: "MONTHLY",   lastDone: "2026-04-10", nextDue: "2026-05-10", isOverdue: true,  isActive: true,  taskCount: 8,  assignedTo: "u3", plannedTriggers: 12, actualTriggers: 10, compliancePct: 83 },
  { id: "pm2", title: "Quarterly compressor overhaul", assetId: "a2", type: "CALENDAR",  frequency: "QUARTERLY", lastDone: "2026-02-01", nextDue: "2026-05-01", isOverdue: true,  isActive: true,  taskCount: 14, assignedTo: "u3", plannedTriggers: 4,  actualTriggers: 3,  compliancePct: 75 },
  { id: "pm3", title: "Monthly conveyor belt check",   assetId: "a3", type: "METER",     frequency: "MONTHLY",   lastDone: "2026-04-28", nextDue: "2026-05-28", isOverdue: false, isActive: true,  taskCount: 6,  assignedTo: "u3", plannedTriggers: 12, actualTriggers: 12, compliancePct: 100 },
  { id: "pm4", title: "Quarterly generator service",   assetId: "a5", type: "CALENDAR",  frequency: "QUARTERLY", lastDone: "2026-04-28", nextDue: "2026-07-28", isOverdue: false, isActive: true,  taskCount: 11, assignedTo: "u2", plannedTriggers: 4,  actualTriggers: 4,  compliancePct: 100 },
  { id: "pm5", title: "Cooling tower inspection",      assetId: "a4", type: "CONDITION", frequency: "MONTHLY",   lastDone: "2026-04-15", nextDue: "2026-05-15", isOverdue: true,  isActive: true,  taskCount: 5,  assignedTo: "u2", plannedTriggers: 12, actualTriggers: 9,  compliancePct: 75 },
  { id: "pm6", title: "Generator fuel check",          assetId: "a5", type: "METER",     frequency: "MONTHLY",   lastDone: "2026-05-01", nextDue: "2026-05-25", isOverdue: false, isActive: false, taskCount: 3,  assignedTo: "u3", plannedTriggers: 12, actualTriggers: 7,  compliancePct: 58 },
  { id: "pm7", title: "Conveyor drive alignment",      assetId: "a3", type: "CALENDAR",  frequency: "QUARTERLY", lastDone: "2026-02-20", nextDue: "2026-05-20", isOverdue: true,  isActive: true,  taskCount: 7,  assignedTo: "u3", plannedTriggers: 4,  actualTriggers: 3,  compliancePct: 75 },
];

// ── Users ─────────────────────────────────────────────────────────────────────
export const users: User[] = [
  { id: "u1", name: "Somchai Ratanaporn", email: "somchai@maintainhub.th", role: "ADMIN",      avatarInitials: "SR" },
  { id: "u2", name: "Nittaya Boonsri",    email: "nittaya@maintainhub.th", role: "MANAGER",    avatarInitials: "NB" },
  { id: "u3", name: "Prasit Tanaka",      email: "prasit@maintainhub.th",  role: "TECHNICIAN", avatarInitials: "PT" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
export const getUserById  = (id: string): User  | undefined => users.find(u => u.id === id);
export const getAssetById = (id: string): Asset | undefined => assets.find(a => a.id === id);

// ── Spare Parts ───────────────────────────────────────────────────────────────
export type PartCategory = "Mechanical" | "Electrical" | "Consumable";

export interface SparePart {
  partNumber: string;
  name: string;
  category: PartCategory;
  quantity: number;
  minStock: number;
  unitCost: number;
  location: string;
  supplier: string;
}

export const spareParts: SparePart[] = [
  { partNumber: "PT-001", name: "Bearing 6205",           category: "Mechanical",  quantity: 15, minStock:  5, unitCost:    450, location: "Warehouse A", supplier: "NSK Thailand" },
  { partNumber: "PT-002", name: "V-Belt B48",             category: "Mechanical",  quantity:  8, minStock: 10, unitCost:    320, location: "Warehouse A", supplier: "Gates Rubber" },
  { partNumber: "PT-003", name: "Oil Seal 40×60",         category: "Mechanical",  quantity: 20, minStock:  8, unitCost:    180, location: "Warehouse B", supplier: "NOK Freudenberg" },
  { partNumber: "PT-004", name: "Contactor LC1D25",       category: "Electrical",  quantity:  4, minStock:  5, unitCost:  2_800, location: "Warehouse B", supplier: "Schneider Electric" },
  { partNumber: "PT-005", name: "Fuse 32A",               category: "Electrical",  quantity: 50, minStock: 20, unitCost:     85, location: "Warehouse C", supplier: "Siemens TH" },
  { partNumber: "PT-006", name: "Air Filter Cartridge",   category: "Consumable",  quantity: 12, minStock:  6, unitCost:  1_200, location: "Warehouse A", supplier: "Donaldson Asia" },
  { partNumber: "PT-007", name: "Hydraulic Pump Gear Set",category: "Mechanical",  quantity:  2, minStock:  3, unitCost: 18_500, location: "Warehouse B", supplier: "Bosch Rexroth" },
  { partNumber: "PT-008", name: "Pressure Gauge 0-10bar", category: "Electrical",  quantity:  8, minStock:  4, unitCost:    680, location: "Warehouse C", supplier: "Wika Thailand" },
  { partNumber: "PT-009", name: "Grease Cartridge 400g",  category: "Consumable",  quantity: 30, minStock: 12, unitCost:    220, location: "Warehouse A", supplier: "SKF Lubrication" },
  { partNumber: "PT-010", name: "Motor 3kW 4P",           category: "Electrical",  quantity:  4, minStock:  2, unitCost: 38_500, location: "Warehouse B", supplier: "WEG Electric" },
];

// ── Notifications ─────────────────────────────────────────────────────────────
export type NotificationType =
  | "WO_OVERDUE"
  | "PM_DUE"
  | "SLA_BREACH"
  | "LOW_STOCK"
  | "WO_ASSIGNED";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string; // ISO-8601
  isRead: boolean;
  link: string;
}

export const notifications: Notification[] = [
  {
    id: "n1",
    type: "SLA_BREACH",
    title: "SLA Breached – WO-2024-0003",
    message: "Inspect pressure relief valve exceeded its 8-hour response SLA.",
    createdAt: "2026-05-23T07:15:00Z",
    isRead: false,
    link: "/work-orders/wo3",
  },
  {
    id: "n2",
    type: "WO_OVERDUE",
    title: "Work Order Overdue – WO-2024-0001",
    message: "Replace mechanical seal was due on 23 May and is still open.",
    createdAt: "2026-05-23T06:00:00Z",
    isRead: false,
    link: "/work-orders/wo1",
  },
  {
    id: "n3",
    type: "PM_DUE",
    title: "PM Due – Pump P-001",
    message: "Monthly pump inspection is overdue by 13 days.",
    createdAt: "2026-05-22T08:00:00Z",
    isRead: false,
    link: "/pm-schedules",
  },
  {
    id: "n4",
    type: "LOW_STOCK",
    title: "Low Stock – PT-005 Fuse 32A",
    message: "V-Belt B48 (PT-002) stock is at 8 units — below the minimum of 10.",
    createdAt: "2026-05-22T04:30:00Z",
    isRead: false,
    link: "/inventory",
  },
  {
    id: "n5",
    type: "PM_DUE",
    title: "PM Due in 2 Days – Cooling Tower CT-004",
    message: "Cooling tower inspection (pm5) is due on 25 May.",
    createdAt: "2026-05-21T09:00:00Z",
    isRead: true,
    link: "/pm-schedules",
  },
  {
    id: "n6",
    type: "WO_ASSIGNED",
    title: "New WO Assigned – WO-2024-0005",
    message: "Load test under full capacity has been assigned to you.",
    createdAt: "2026-05-21T07:45:00Z",
    isRead: true,
    link: "/work-orders/wo5",
  },
  {
    id: "n7",
    type: "LOW_STOCK",
    title: "Low Stock – Hydraulic Pump Gear Set",
    message: "PT-007 stock is at 2 units — below the minimum of 3.",
    createdAt: "2026-05-20T11:00:00Z",
    isRead: true,
    link: "/inventory",
  },
  {
    id: "n8",
    type: "WO_OVERDUE",
    title: "Work Order Overdue – WO-2024-0004",
    message: "Clean condenser coils is approaching its due date on 28 May.",
    createdAt: "2026-05-20T08:30:00Z",
    isRead: true,
    link: "/work-orders/wo4",
  },
];
