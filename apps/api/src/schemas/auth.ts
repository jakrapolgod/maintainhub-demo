import { z } from 'zod'

export const RegisterBodySchema = z.object({
  /** Display name of the company / organisation */
  companyName: z.string().trim().min(2, 'Too short').max(100),
  /**
   * URL-safe tenant identifier — must be globally unique.
   * Used in login requests and (future) subdomain routing.
   */
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Too short')
    .max(50, 'Too long')
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
  adminEmail: z.string().trim().toLowerCase().email('Invalid email address'),
  adminName: z.string().trim().min(2, 'Too short').max(100),
  /** bcrypt max is 72 bytes — enforce at schema level to avoid silent truncation */
  password: z
    .string()
    .min(8, 'Must be at least 8 characters')
    .max(72, 'Exceeds bcrypt maximum of 72 characters'),
})
export type RegisterBody = z.infer<typeof RegisterBodySchema>

export const LoginBodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password required'),
  /** Identifies which tenant this login belongs to */
  tenantSlug: z.string().trim().min(1, 'Tenant identifier required'),
})
export type LoginBody = z.infer<typeof LoginBodySchema>

export const ForgotPasswordBodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  tenantSlug: z.string().trim().min(1, 'Tenant identifier required'),
})
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBodySchema>

export const ResetPasswordBodySchema = z.object({
  token: z.string().min(1, 'Reset token required'),
  password: z
    .string()
    .min(8, 'Must be at least 8 characters')
    .max(72, 'Exceeds bcrypt maximum of 72 characters'),
})
export type ResetPasswordBody = z.infer<typeof ResetPasswordBodySchema>
