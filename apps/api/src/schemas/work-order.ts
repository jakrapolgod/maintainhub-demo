import { z } from 'zod'

// ── Create ────────────────────────────────────────────────────────────────────

export const CreateWoSchema = z.object({
  title: z.string().trim().min(3, 'Too short').max(200),
  description: z.string().trim().max(5000).optional(),
  type: z.enum(['CORRECTIVE', 'PREVENTIVE', 'INSPECTION', 'EMERGENCY']).default('CORRECTIVE'),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  assetId: z.string().cuid('Invalid asset ID'),
  assigneeIds: z.array(z.string().cuid()).default([]),
  dueDate: z.coerce.date().optional(),
  parentId: z.string().cuid('Invalid parent WO ID').optional(),
})
export type CreateWoDto = z.infer<typeof CreateWoSchema>

// ── Update ────────────────────────────────────────────────────────────────────

export const UpdateWoSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
    dueDate: z.coerce.date().optional(),
    failureCodeId: z.string().cuid().optional(),
  })
  .strict()
export type UpdateWoDto = z.infer<typeof UpdateWoSchema>

// ── Actions ───────────────────────────────────────────────────────────────────

export const AssignSchema = z.object({
  technicianIds: z.array(z.string().cuid()).min(1, 'At least one technician required'),
})
export type AssignDto = z.infer<typeof AssignSchema>

export const CompleteSchema = z.object({
  resolution: z.string().trim().min(10, 'Resolution must be at least 10 characters').max(5000),
  failureCodeId: z.string().cuid().optional(),
})
export type CompleteDto = z.infer<typeof CompleteSchema>

export const CancelSchema = z.object({
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
})
export type CancelDto = z.infer<typeof CancelSchema>

// ── Labor ─────────────────────────────────────────────────────────────────────

export const AddLaborSchema = z.object({
  date: z.coerce.date(),
  hours: z
    .number()
    .positive('Hours must be positive')
    .max(24, 'Cannot log more than 24 hours per entry')
    .multipleOf(0.25, 'Hours must be in 15-minute increments'),
  ratePerHour: z.number().positive('Rate must be positive').max(99999),
  description: z.string().trim().max(500).optional(),
})
export type AddLaborDto = z.infer<typeof AddLaborSchema>

// ── Part usage ────────────────────────────────────────────────────────────────

export const AddPartUsageSchema = z.object({
  partId: z.string().cuid('Invalid part ID'),
  quantity: z
    .number()
    .positive('Quantity must be positive')
    .int('Quantity must be a whole number')
    .max(10_000),
  unitCost: z.number().nonnegative().max(9_999_999).optional(),
})
export type AddPartUsageDto = z.infer<typeof AddPartUsageSchema>

// ── Comments ──────────────────────────────────────────────────────────────────

export const AddCommentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(5000),
})
export type AddCommentDto = z.infer<typeof AddCommentSchema>

// ── List query ────────────────────────────────────────────────────────────────

export const ListWoQuerySchema = z.object({
  status: z.enum(['DRAFT', 'OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  type: z.enum(['CORRECTIVE', 'PREVENTIVE', 'INSPECTION', 'EMERGENCY']).optional(),
  assetId: z.string().cuid().optional(),
  assigneeId: z.string().cuid().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
export type ListWoQuery = z.infer<typeof ListWoQuerySchema>
