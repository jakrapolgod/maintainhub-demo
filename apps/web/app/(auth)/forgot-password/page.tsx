'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Loader2, CheckCircle2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useForgotPassword } from '@/hooks/use-auth'

// ── Schema ────────────────────────────────────────────────────────────────────

const forgotSchema = z.object({
  tenantSlug: z
    .string()
    .trim()
    .min(1, 'Workspace identifier is required')
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
  email: z.string().trim().email('Enter a valid email address'),
})

type ForgotValues = z.infer<typeof forgotSchema>

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ForgotPasswordPage() {
  const forgot = useForgotPassword()
  const [submitted, setSubmitted] = useState(false)

  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { tenantSlug: '', email: '' },
  })

  function onSubmit(values: ForgotValues) {
    forgot.mutate(values, {
      onSuccess: () => setSubmitted(true),
    })
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2">
            <CheckCircle2 className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
          <CardDescription>
            If an account with that email exists, a password reset link has been sent.
            It expires in <strong>60 minutes</strong>.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/login" className="text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Forgot password?</CardTitle>
        <CardDescription>
          Enter your workspace and email. We&apos;ll send a reset link if an account exists.
        </CardDescription>
      </CardHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4">
          {forgot.error && (
            <Alert variant="destructive">
              <AlertDescription>
                {forgot.error instanceof Error ? forgot.error.message : 'Request failed'}
              </AlertDescription>
            </Alert>
          )}

          {/* Workspace */}
          <div className="space-y-1.5">
            <Label htmlFor="tenantSlug">Workspace</Label>
            <Input
              id="tenantSlug"
              placeholder="acme-corp"
              autoCapitalize="none"
              {...form.register('tenantSlug')}
            />
            {form.formState.errors.tenantSlug && (
              <p className="text-xs text-destructive">
                {form.formState.errors.tenantSlug.message}
              </p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@acme.com"
              autoComplete="email"
              {...form.register('email')}
            />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={forgot.isPending}>
            {forgot.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send reset link
          </Button>

          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground text-center"
          >
            ← Back to sign in
          </Link>
        </CardFooter>
      </form>
    </Card>
  )
}
