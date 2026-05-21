'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useRegister } from '@/hooks/use-auth'
import { ApiError } from '@/lib/api'

// ── Schema ────────────────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    companyName: z.string().trim().min(2, 'Company name must be at least 2 characters').max(100),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, 'Must be at least 2 characters')
      .max(50, 'Must be 50 characters or less')
      .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
    adminName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    adminEmail: z.string().trim().email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Must be at least 8 characters')
      .max(72, 'Must be 72 characters or less'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type RegisterValues = z.infer<typeof registerSchema>

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const register = useRegister()

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      companyName: '',
      slug: '',
      adminName: '',
      adminEmail: '',
      password: '',
      confirmPassword: '',
    },
  })

  // Auto-derive slug from company name
  function handleCompanyNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.currentTarget.value
    form.setValue('companyName', name)
    const slugVal = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    if (!form.getValues('slug') || !form.formState.dirtyFields.slug) {
      form.setValue('slug', slugVal)
    }
  }

  function onSubmit({ confirmPassword: _confirm, ...values }: RegisterValues) {
    register.mutate(values)
  }

  const serverError =
    register.error instanceof ApiError ? register.error.message : undefined

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Create workspace</CardTitle>
        <CardDescription>
          Start your 14-day free trial — no credit card required
        </CardDescription>
      </CardHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4">
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          {/* Company name + slug */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="companyName">Company name</Label>
              <Input
                id="companyName"
                placeholder="Acme Corporation"
                autoComplete="organization"
                {...form.register('companyName')}
                onChange={handleCompanyNameChange}
              />
              {form.formState.errors.companyName && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.companyName.message}
                </p>
              )}
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="slug">
                Workspace ID
                <span className="ml-1 text-xs text-muted-foreground font-normal">
                  (used to log in)
                </span>
              </Label>
              <div className="flex items-center rounded-md border border-input bg-background text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <span className="px-3 py-2 text-muted-foreground bg-muted rounded-l-md border-r border-input">
                  app/
                </span>
                <input
                  id="slug"
                  className="flex-1 h-10 px-3 bg-transparent outline-none placeholder:text-muted-foreground"
                  placeholder="acme-corp"
                  {...form.register('slug')}
                />
              </div>
              {form.formState.errors.slug && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.slug.message}
                </p>
              )}
            </div>
          </div>

          {/* Admin name */}
          <div className="space-y-1.5">
            <Label htmlFor="adminName">Your name</Label>
            <Input
              id="adminName"
              placeholder="Jane Smith"
              autoComplete="name"
              {...form.register('adminName')}
            />
            {form.formState.errors.adminName && (
              <p className="text-xs text-destructive">
                {form.formState.errors.adminName.message}
              </p>
            )}
          </div>

          {/* Admin email */}
          <div className="space-y-1.5">
            <Label htmlFor="adminEmail">Work email</Label>
            <Input
              id="adminEmail"
              type="email"
              placeholder="jane@acme.com"
              autoComplete="email"
              {...form.register('adminEmail')}
            />
            {form.formState.errors.adminEmail && (
              <p className="text-xs text-destructive">
                {form.formState.errors.adminEmail.message}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...form.register('password')}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...form.register('confirmPassword')}
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={register.isPending}>
            {register.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create workspace
          </Button>

          <p className="text-sm text-muted-foreground text-center">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
