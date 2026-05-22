// Mock data for MaintainHub demo

export type AssetStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE";
export type CriticalityClass = "A" | "B" | "C";
export type WOStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED";
export type WOPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type PMFrequency = "MONTHLY" | "QUARTERLY";
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
}

export interface PMSchedule {
  id: string;
  title: string;
  assetId: string;
  frequency: PMFrequency;
  lastDone: string;
  nextDue: string;
  isOverdue: boolean;
  assignedTo: string;
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
  { id: "wo1", title: "Replace mechanical seal",       assetId: "a1", status: "OPEN",        priority: "CRITICAL", assignedTo: "u3", createdAt: "2026-05-20", dueDate: "2026-05-23" },
  { id: "wo2", title: "Lubricate drive belt",          assetId: "a3", status: "OPEN",        priority: "MEDIUM",   assignedTo: "u3", createdAt: "2026-05-18", dueDate: "2026-05-30" },
  { id: "wo3", title: "Inspect pressure relief valve", assetId: "a2", status: "IN_PROGRESS", priority: "HIGH",     assignedTo: "u3", createdAt: "2026-05-15", dueDate: "2026-05-25" },
  { id: "wo4", title: "Clean condenser coils",         assetId: "a4", status: "IN_PROGRESS", priority: "MEDIUM",   assignedTo: "u3", createdAt: "2026-05-12", dueDate: "2026-05-28" },
  { id: "wo5", title: "Load test under full capacity", assetId: "a5", status: "OPEN",        priority: "HIGH",     assignedTo: "u2", createdAt: "2026-05-21", dueDate: "2026-06-01" },
  { id: "wo6", title: "Replace air filter cartridge",  assetId: "a2", status: "COMPLETED",   priority: "LOW",      assignedTo: "u3", createdAt: "2026-04-20", dueDate: "2026-04-25", completedAt: "2026-04-24" },
  { id: "wo7", title: "Calibrate flow sensor",         assetId: "a1", status: "COMPLETED",   priority: "MEDIUM",   assignedTo: "u3", createdAt: "2026-04-10", dueDate: "2026-04-18", completedAt: "2026-04-17" },
  { id: "wo8", title: "Tighten conveyor tensioner",    assetId: "a3", status: "COMPLETED",   priority: "HIGH",     assignedTo: "u3", createdAt: "2026-03-28", dueDate: "2026-04-02", completedAt: "2026-04-01" },
];

// ── PM Schedules ──────────────────────────────────────────────────────────────
export const pmSchedules: PMSchedule[] = [
  { id: "pm1", title: "Monthly pump inspection",       assetId: "a1", frequency: "MONTHLY",   lastDone: "2026-04-10", nextDue: "2026-05-10", isOverdue: true,  assignedTo: "u3" },
  { id: "pm2", title: "Quarterly compressor overhaul", assetId: "a2", frequency: "QUARTERLY", lastDone: "2026-02-01", nextDue: "2026-05-01", isOverdue: true,  assignedTo: "u3" },
  { id: "pm3", title: "Monthly conveyor belt check",   assetId: "a3", frequency: "MONTHLY",   lastDone: "2026-04-28", nextDue: "2026-05-28", isOverdue: false, assignedTo: "u3" },
  { id: "pm4", title: "Quarterly generator service",   assetId: "a5", frequency: "QUARTERLY", lastDone: "2026-04-28", nextDue: "2026-07-28", isOverdue: false, assignedTo: "u2" },
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
