import { z } from 'zod'

export const SendInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  role: z
    .enum(['ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER', 'CONTRACTOR'])
    .default('TECHNICIAN'),
})
export type SendInvitationDto = z.infer<typeof SendInvitationSchema>

export const AcceptInvitationSchema = z.object({
  /** Display name the new user will have in MaintainHub. */
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  /** Password chosen by the invitee — bcrypt max is 72 bytes. */
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password exceeds bcrypt maximum of 72 characters'),
})
export type AcceptInvitationDto = z.infer<typeof AcceptInvitationSchema>
