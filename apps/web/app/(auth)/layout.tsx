/**
 * Auth layout — centered card on a subtle gradient background.
 * All (auth) pages share this wrapper: login, register, forgot, reset.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      {/* Brand header */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">M</span>
          </div>
          <span className="text-xl font-bold tracking-tight">MaintainHub</span>
        </div>
        <p className="text-xs text-muted-foreground">Enterprise CMMS Platform</p>
      </div>

      {/* Page content (the card) */}
      {children}
    </div>
  )
}
