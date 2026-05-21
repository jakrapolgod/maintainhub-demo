import { z } from 'zod'

// ── Asset Category ─────────────────────────────────────────────────────────────

export const CreateAssetCategorySchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9_-]+$/, 'Only uppercase letters, numbers, hyphens and underscores'),
  name: z.string().trim().min(1).max(100),
})
export type CreateAssetCategoryDto = z.infer<typeof CreateAssetCategorySchema>

export const UpdateAssetCategorySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
})
export type UpdateAssetCategoryDto = z.infer<typeof UpdateAssetCategorySchema>

// ── Location ───────────────────────────────────────────────────────────────────

export const CreateLocationSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(30)
    .regex(/^[A-Z0-9_-]+$/, 'Only uppercase letters, numbers, hyphens and underscores'),
  name: z.string().trim().min(1).max(100),
  parentId: z.string().cuid().optional(),
})
export type CreateLocationDto = z.infer<typeof CreateLocationSchema>

export const UpdateLocationSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  parentId: z.string().cuid().nullable().optional(),
})
export type UpdateLocationDto = z.infer<typeof UpdateLocationSchema>

// ── Asset ──────────────────────────────────────────────────────────────────────

export const CreateAssetSchema = z.object({
  assetNumber: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, 'Only letters, numbers, hyphens and underscores'),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  categoryId: z.string().cuid(),
  parentId: z.string().cuid().optional(),
  locationId: z.string().cuid().optional(),
  criticality: z.enum(['A', 'B', 'C', 'D']).optional(),
  status: z.enum(['OPERATIONAL', 'STANDBY', 'UNDER_MAINTENANCE', 'DECOMMISSIONED']).optional(),
  manufacturer: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  serialNumber: z.string().trim().max(100).optional(),
  installDate: z.coerce.date().optional(),
  warrantyExpiry: z.coerce.date().optional(),
  purchaseCost: z.number().nonnegative().optional(),
  customFields: z.record(z.unknown()).optional(),
})
export type CreateAssetDto = z.infer<typeof CreateAssetSchema>

export const UpdateAssetSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  categoryId: z.string().cuid().optional(),
  parentId: z.string().cuid().nullable().optional(),
  locationId: z.string().cuid().nullable().optional(),
  criticality: z.enum(['A', 'B', 'C', 'D']).optional(),
  status: z.enum(['OPERATIONAL', 'STANDBY', 'UNDER_MAINTENANCE', 'DECOMMISSIONED']).optional(),
  manufacturer: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  serialNumber: z.string().trim().max(100).optional(),
  installDate: z.coerce.date().nullable().optional(),
  warrantyExpiry: z.coerce.date().nullable().optional(),
  purchaseCost: z.number().nonnegative().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
})
export type UpdateAssetDto = z.infer<typeof UpdateAssetSchema>

export const ListAssetQuerySchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
  status:     z.enum(['OPERATIONAL', 'STANDBY', 'UNDER_MAINTENANCE', 'DECOMMISSIONED']).optional(),
  criticality: z.enum(['A', 'B', 'C', 'D']).optional(),
  categoryId: z.string().cuid().optional(),
  locationId: z.string().cuid().optional(),
  parentId:   z.string().cuid().optional(),
  search:     z.string().trim().max(100).optional(),
  /** When true, return only root assets (parentId = null) with children populated one level deep */
  tree:       z.coerce.boolean().optional(),
})
export type ListAssetQuery = z.infer<typeof ListAssetQuerySchema>
