/**
 * Mock asset data for demo / offline mode.
 * Used as fallback when the API is unavailable.
 */
import type {
  AssetCard,
  AssetFlatNode,
  AssetTreeNode,
  AssetTreeResult,
  AssetListResult,
  AssetCategory,
  LocationStub,
} from '@/lib/api/assets'

// ── Categories ────────────────────────────────────────────────────────────────

export const mockCategories: AssetCategory[] = [
  { id: 'cat-pump', code: 'PUMP', name: 'Pump' },
  { id: 'cat-compressor', code: 'COMP', name: 'Compressor' },
  { id: 'cat-conveyor', code: 'CONV', name: 'Conveyor' },
  { id: 'cat-electrical', code: 'ELEC', name: 'Electrical' },
  { id: 'cat-hvac', code: 'HVAC', name: 'HVAC' },
  { id: 'cat-cooling', code: 'COOL', name: 'Cooling Tower' },
]

// ── Locations ─────────────────────────────────────────────────────────────────

export const mockLocations: LocationStub[] = [
  { id: 'loc-b1b', code: 'BLD1-B', name: 'Building 1 – Basement' },
  { id: 'loc-b1f', code: 'BLD1-F1', name: 'Building 1 – Floor 1' },
  { id: 'loc-pra', code: 'PROD-A', name: 'Production Hall A' },
  { id: 'loc-mer', code: 'MAIN-E', name: 'Main Electrical Room' },
  { id: 'loc-nor', code: 'YARD-N', name: 'North Yard' },
  { id: 'loc-ofc', code: 'OFFICE', name: 'Office Building' },
]

// ── AssetCard rows (list table) ───────────────────────────────────────────────

export const mockAssetCards: AssetCard[] = [
  {
    id: 'p-001',
    assetNumber: 'P-001',
    name: 'Pump P-001',
    status: 'OPERATIONAL',
    criticality: 'A',
    categoryId: 'cat-pump',
    categoryName: 'Pump',
    locationId: 'loc-b1b',
    locationName: 'Building 1 – Basement',
    parentId: 'sys-cooling',
    parentName: 'Cooling Water System',
    manufacturer: 'Grundfos',
    model: 'CM5',
    serialNumber: 'GF-2019-0042',
    installDate: '2019-03-15',
    warrantyExpiry: '2022-03-15',
    isWarrantyActive: false,
    openWOCount: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2026-05-20T06:00:00Z',
  },
  {
    id: 'p-002',
    assetNumber: 'P-002',
    name: 'Pump P-002',
    status: 'UNDER_MAINTENANCE',
    criticality: 'A',
    categoryId: 'cat-pump',
    categoryName: 'Pump',
    locationId: 'loc-b1b',
    locationName: 'Building 1 – Basement',
    parentId: 'sys-cooling',
    parentName: 'Cooling Water System',
    manufacturer: 'Grundfos',
    model: 'CM5',
    serialNumber: 'GF-2019-0043',
    installDate: '2019-03-15',
    warrantyExpiry: '2022-03-15',
    isWarrantyActive: false,
    openWOCount: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2026-05-15T08:00:00Z',
  },
  {
    id: 'ac-001',
    assetNumber: 'AC-001',
    name: 'Compressor AC-001',
    status: 'OPERATIONAL',
    criticality: 'B',
    categoryId: 'cat-compressor',
    categoryName: 'Compressor',
    locationId: 'loc-b1f',
    locationName: 'Building 1 – Floor 1',
    parentId: 'sys-compress',
    parentName: 'Compressed Air System',
    manufacturer: 'Atlas Copco',
    model: 'GA15',
    serialNumber: 'AC-2020-1101',
    installDate: '2020-06-01',
    warrantyExpiry: '2023-06-01',
    isWarrantyActive: false,
    openWOCount: 2,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2026-05-21T08:00:00Z',
  },
  {
    id: 'ac-002',
    assetNumber: 'AC-002',
    name: 'Compressor AC-002',
    status: 'STANDBY',
    criticality: 'B',
    categoryId: 'cat-compressor',
    categoryName: 'Compressor',
    locationId: 'loc-b1f',
    locationName: 'Building 1 – Floor 1',
    parentId: 'sys-compress',
    parentName: 'Compressed Air System',
    manufacturer: 'Atlas Copco',
    model: 'GA15',
    serialNumber: 'AC-2020-1102',
    installDate: '2020-06-01',
    warrantyExpiry: '2023-06-01',
    isWarrantyActive: false,
    openWOCount: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2026-05-16T09:00:00Z',
  },
  {
    id: 'cb-001',
    assetNumber: 'CB-001',
    name: 'Conveyor CB-001',
    status: 'OPERATIONAL',
    criticality: 'B',
    categoryId: 'cat-conveyor',
    categoryName: 'Conveyor',
    locationId: 'loc-pra',
    locationName: 'Production Hall A',
    parentId: 'sys-conveyor',
    parentName: 'Conveyor System',
    manufacturer: 'Interroll',
    model: '400',
    serialNumber: 'IR-2021-4401',
    installDate: '2021-02-10',
    warrantyExpiry: '2024-02-10',
    isWarrantyActive: false,
    openWOCount: 2,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2026-05-22T10:00:00Z',
  },
  {
    id: 'cb-002',
    assetNumber: 'CB-002',
    name: 'Conveyor CB-002',
    status: 'OPERATIONAL',
    criticality: 'C',
    categoryId: 'cat-conveyor',
    categoryName: 'Conveyor',
    locationId: 'loc-pra',
    locationName: 'Production Hall A',
    parentId: 'sys-conveyor',
    parentName: 'Conveyor System',
    manufacturer: 'Interroll',
    model: '400',
    serialNumber: 'IR-2021-4402',
    installDate: '2021-02-10',
    warrantyExpiry: '2024-02-10',
    isWarrantyActive: false,
    openWOCount: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2026-05-19T10:00:00Z',
  },
  {
    id: 'g-001',
    assetNumber: 'G-001',
    name: 'Generator G-001',
    status: 'OPERATIONAL',
    criticality: 'A',
    categoryId: 'cat-electrical',
    categoryName: 'Electrical',
    locationId: 'loc-mer',
    locationName: 'Main Electrical Room',
    parentId: 'sys-electric',
    parentName: 'Electrical System',
    manufacturer: 'Cummins',
    model: 'C150D5',
    serialNumber: 'CM-2018-7751',
    installDate: '2018-09-01',
    warrantyExpiry: '2021-09-01',
    isWarrantyActive: false,
    openWOCount: 2,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2026-05-22T22:00:00Z',
  },
  {
    id: 't-001',
    assetNumber: 'T-001',
    name: 'Transformer T-001',
    status: 'OPERATIONAL',
    criticality: 'A',
    categoryId: 'cat-electrical',
    categoryName: 'Electrical',
    locationId: 'loc-mer',
    locationName: 'Main Electrical Room',
    parentId: 'sys-electric',
    parentName: 'Electrical System',
    manufacturer: 'ABB',
    model: '500kVA',
    serialNumber: 'ABB-2017-0099',
    installDate: '2017-11-01',
    warrantyExpiry: '2020-11-01',
    isWarrantyActive: false,
    openWOCount: 2,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2026-05-21T09:00:00Z',
  },
  {
    id: 'ct-001',
    assetNumber: 'CT-001',
    name: 'Cooling Tower CT-001',
    status: 'OPERATIONAL',
    criticality: 'B',
    categoryId: 'cat-cooling',
    categoryName: 'Cooling Tower',
    locationId: 'loc-nor',
    locationName: 'North Yard',
    parentId: null,
    parentName: null,
    manufacturer: 'BAC',
    model: 'VFL',
    serialNumber: 'BAC-2019-0311',
    installDate: '2019-07-01',
    warrantyExpiry: '2022-07-01',
    isWarrantyActive: false,
    openWOCount: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2026-05-18T08:00:00Z',
  },
  {
    id: 'hv-001',
    assetNumber: 'HV-001',
    name: 'HVAC Unit HV-001',
    status: 'OPERATIONAL',
    criticality: 'C',
    categoryId: 'cat-hvac',
    categoryName: 'HVAC',
    locationId: 'loc-ofc',
    locationName: 'Office Building',
    parentId: null,
    parentName: null,
    manufacturer: 'Daikin',
    model: 'VRV IV',
    serialNumber: 'DK-2022-5500',
    installDate: '2022-01-15',
    warrantyExpiry: '2025-01-15',
    isWarrantyActive: false,
    openWOCount: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2026-05-20T09:00:00Z',
  },
]

// ── AssetFlatNode rows (tree panel) ───────────────────────────────────────────

export const mockFlatNodes: AssetFlatNode[] = [
  // Plant root
  {
    id: 'plant-01',
    assetNumber: 'NMA-PLANT',
    name: 'Nakhon Ratchasima Plant',
    status: 'OPERATIONAL',
    criticality: 'A',
    locationId: null,
    locationName: null,
    parentId: null,
    depth: 0,
    openWOCount: 0,
    lastMaintenanceDate: null,
  },
  // Systems (depth 1)
  {
    id: 'sys-cooling',
    assetNumber: 'SYS-COOL',
    name: 'Cooling Water System',
    status: 'OPERATIONAL',
    criticality: 'A',
    locationId: 'loc-b1b',
    locationName: 'Building 1 – Basement',
    parentId: 'plant-01',
    depth: 1,
    openWOCount: 2,
    lastMaintenanceDate: '2026-04-10',
  },
  {
    id: 'sys-compress',
    assetNumber: 'SYS-COMP',
    name: 'Compressed Air System',
    status: 'UNDER_MAINTENANCE',
    criticality: 'B',
    locationId: 'loc-b1f',
    locationName: 'Building 1 – Floor 1',
    parentId: 'plant-01',
    depth: 1,
    openWOCount: 3,
    lastMaintenanceDate: '2026-02-01',
  },
  {
    id: 'sys-conveyor',
    assetNumber: 'SYS-CONV',
    name: 'Conveyor System',
    status: 'OPERATIONAL',
    criticality: 'B',
    locationId: 'loc-pra',
    locationName: 'Production Hall A',
    parentId: 'plant-01',
    depth: 1,
    openWOCount: 3,
    lastMaintenanceDate: '2026-04-28',
  },
  {
    id: 'sys-electric',
    assetNumber: 'SYS-ELEC',
    name: 'Electrical System',
    status: 'OPERATIONAL',
    criticality: 'A',
    locationId: 'loc-mer',
    locationName: 'Main Electrical Room',
    parentId: 'plant-01',
    depth: 1,
    openWOCount: 4,
    lastMaintenanceDate: '2026-04-28',
  },
  // Equipment (depth 2)
  {
    id: 'p-001',
    assetNumber: 'P-001',
    name: 'Pump P-001',
    status: 'OPERATIONAL',
    criticality: 'A',
    locationId: 'loc-b1b',
    locationName: 'Building 1 – Basement',
    parentId: 'sys-cooling',
    depth: 2,
    openWOCount: 1,
    lastMaintenanceDate: '2026-04-10',
  },
  {
    id: 'p-002',
    assetNumber: 'P-002',
    name: 'Pump P-002',
    status: 'UNDER_MAINTENANCE',
    criticality: 'A',
    locationId: 'loc-b1b',
    locationName: 'Building 1 – Basement',
    parentId: 'sys-cooling',
    depth: 2,
    openWOCount: 1,
    lastMaintenanceDate: '2026-03-20',
  },
  {
    id: 'ac-001',
    assetNumber: 'AC-001',
    name: 'Compressor AC-001',
    status: 'OPERATIONAL',
    criticality: 'B',
    locationId: 'loc-b1f',
    locationName: 'Building 1 – Floor 1',
    parentId: 'sys-compress',
    depth: 2,
    openWOCount: 2,
    lastMaintenanceDate: '2026-02-01',
  },
  {
    id: 'ac-002',
    assetNumber: 'AC-002',
    name: 'Compressor AC-002',
    status: 'STANDBY',
    criticality: 'B',
    locationId: 'loc-b1f',
    locationName: 'Building 1 – Floor 1',
    parentId: 'sys-compress',
    depth: 2,
    openWOCount: 1,
    lastMaintenanceDate: '2026-04-15',
  },
  {
    id: 'cb-001',
    assetNumber: 'CB-001',
    name: 'Conveyor CB-001',
    status: 'OPERATIONAL',
    criticality: 'B',
    locationId: 'loc-pra',
    locationName: 'Production Hall A',
    parentId: 'sys-conveyor',
    depth: 2,
    openWOCount: 2,
    lastMaintenanceDate: '2026-04-28',
  },
  {
    id: 'cb-002',
    assetNumber: 'CB-002',
    name: 'Conveyor CB-002',
    status: 'OPERATIONAL',
    criticality: 'C',
    locationId: 'loc-pra',
    locationName: 'Production Hall A',
    parentId: 'sys-conveyor',
    depth: 2,
    openWOCount: 1,
    lastMaintenanceDate: '2026-04-20',
  },
  {
    id: 'g-001',
    assetNumber: 'G-001',
    name: 'Generator G-001',
    status: 'OPERATIONAL',
    criticality: 'A',
    locationId: 'loc-mer',
    locationName: 'Main Electrical Room',
    parentId: 'sys-electric',
    depth: 2,
    openWOCount: 2,
    lastMaintenanceDate: '2026-04-28',
  },
  {
    id: 't-001',
    assetNumber: 'T-001',
    name: 'Transformer T-001',
    status: 'OPERATIONAL',
    criticality: 'A',
    locationId: 'loc-mer',
    locationName: 'Main Electrical Room',
    parentId: 'sys-electric',
    depth: 2,
    openWOCount: 2,
    lastMaintenanceDate: '2026-01-15',
  },
  // Standalone (depth 0)
  {
    id: 'ct-001',
    assetNumber: 'CT-001',
    name: 'Cooling Tower CT-001',
    status: 'OPERATIONAL',
    criticality: 'B',
    locationId: 'loc-nor',
    locationName: 'North Yard',
    parentId: null,
    depth: 0,
    openWOCount: 1,
    lastMaintenanceDate: '2026-03-10',
  },
  {
    id: 'hv-001',
    assetNumber: 'HV-001',
    name: 'HVAC Unit HV-001',
    status: 'OPERATIONAL',
    criticality: 'C',
    locationId: 'loc-ofc',
    locationName: 'Office Building',
    parentId: null,
    depth: 0,
    openWOCount: 1,
    lastMaintenanceDate: '2026-02-20',
  },
]

// ── Tree structure helpers ─────────────────────────────────────────────────────

function buildTreeNodes(parentId: string | null): AssetTreeNode[] {
  return mockFlatNodes
    .filter((n) => n.parentId === parentId)
    .map((n) => ({
      id: n.id,
      assetNumber: n.assetNumber,
      name: n.name,
      status: n.status,
      criticality: n.criticality,
      locationId: n.locationId,
      locationName: n.locationName,
      openWOCount: n.openWOCount,
      lastMaintenanceDate: n.lastMaintenanceDate,
      children: buildTreeNodes(n.id),
    }))
}

// ── Exported result shapes ────────────────────────────────────────────────────

export function getMockAssetTree(rootAssetId?: string): AssetTreeResult {
  const flat = rootAssetId
    ? mockFlatNodes.filter((n) => n.id === rootAssetId || isDescendantOf(n, rootAssetId))
    : mockFlatNodes
  const tree = rootAssetId ? buildTreeNodes(rootAssetId) : buildTreeNodes(null)
  return { tree, flat, totalCount: flat.length }
}

function isDescendantOf(node: AssetFlatNode, ancestorId: string): boolean {
  if (!node.parentId) return false
  if (node.parentId === ancestorId) return true
  const parent = mockFlatNodes.find((n) => n.id === node.parentId)
  return parent ? isDescendantOf(parent, ancestorId) : false
}

export function getMockAssetList(filters: {
  search?: string
  status?: string[]
  criticality?: string[]
  categoryId?: string
  parentId?: string
  page?: number
  limit?: number
}): AssetListResult {
  let items = [...mockAssetCards]

  if (filters.search) {
    const q = filters.search.toLowerCase()
    items = items.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.assetNumber.toLowerCase().includes(q) ||
        (a.manufacturer ?? '').toLowerCase().includes(q),
    )
  }
  if (filters.status?.length) {
    items = items.filter((a) => filters.status!.includes(a.status))
  }
  if (filters.criticality?.length) {
    items = items.filter((a) => filters.criticality!.includes(a.criticality))
  }
  if (filters.categoryId) {
    items = items.filter((a) => a.categoryId === filters.categoryId)
  }
  if (filters.parentId) {
    items = items.filter((a) => a.parentId === filters.parentId)
  }

  const total = items.length
  const page = filters.page ?? 1
  const limit = filters.limit ?? 20
  const start = (page - 1) * limit
  items = items.slice(start, start + limit)

  return { items, total }
}
