'use client'

/**
 * QRScannerModal
 *
 * Activates the device camera via html5-qrcode to scan asset QR codes.
 * On a successful scan it extracts the assetId from the encoded URL and
 * navigates to /assets/{assetId}.
 *
 * Fallback: typed asset-number input that resolves the assetId via the API
 * and navigates to the same destination.
 *
 * Usage:
 *   <QRScannerModal />               — renders the floating action button
 *   <QRScannerModal trigger={...} /> — custom trigger element
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Html5Qrcode } from 'html5-qrcode'
import { QrCode, Keyboard, Camera, X, Loader2, AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { listAssets } from '@/lib/api/assets'

// ── Helper: parse assetId out of the QR URL ───────────────────────────────────

/**
 * QR codes encode:  https://app.maintainhub.com/assets/{assetId}?t={slug}
 * This regex extracts the CUID segment after `/assets/`.
 */
function extractAssetId(text: string): string | null {
  const match = text.match(/\/assets\/([a-z0-9]{24,25})(?:\?|$)/i)
  return match?.[1] ?? null
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface QRScannerModalProps {
  /** Custom trigger element. When omitted a default FAB is rendered. */
  trigger?: React.ReactNode
  /** Additional class names on the FAB button wrapper. */
  className?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QRScannerModal({ trigger, className }: QRScannerModalProps) {
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'camera' | 'manual'>('camera')
  const [scanning, setScanning] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)
  const [manualVal, setManualVal] = useState('')
  const [resolving, setResolving] = useState(false)
  const [manualErr, setManualErr] = useState<string | null>(null)

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerId = 'qr-scanner-container'

  // ── Start / stop camera ───────────────────────────────────────────────────

  const stopScanner = useCallback(async () => {
    if (scannerRef.current?.isScanning) {
      try {
        await scannerRef.current.stop()
      } catch {
        /* ignore */
      }
    }
    scannerRef.current = null
    setScanning(false)
  }, [])

  const startScanner = useCallback(async () => {
    setCamError(null)
    setScanning(true)

    try {
      const scanner = new Html5Qrcode(containerId)
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          // Success callback
          const assetId = extractAssetId(decodedText)
          void stopScanner()
          if (assetId) {
            setOpen(false)
            router.push(`/assets/${assetId}`)
          } else {
            setCamError(`Unrecognised QR code: "${decodedText.slice(0, 60)}"`)
            setScanning(false)
          }
        },
        () => {
          /* error per frame — ignore */
        },
      )
    } catch (err) {
      setScanning(false)
      const msg = err instanceof Error ? err.message : 'Camera unavailable'
      if (msg.toLowerCase().includes('permission')) {
        setCamError('Camera permission denied. Enable camera access in browser settings.')
      } else {
        setCamError(`Camera error: ${msg}`)
      }
    }
  }, [router, stopScanner])

  // Start scanner when modal opens in camera mode
  useEffect(() => {
    if (open && mode === 'camera') {
      void startScanner()
    }
    return () => {
      void stopScanner()
    }
  }, [open, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up on unmount
  useEffect(
    () => () => {
      void stopScanner()
    },
    [stopScanner],
  )

  // ── Manual asset-number resolve ────────────────────────────────────────────

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    const val = manualVal.trim().toUpperCase()
    if (!val) return

    setManualErr(null)
    setResolving(true)

    try {
      const result = await listAssets({ search: val, limit: 5 })
      const match = result.items.find((a) => a.assetNumber.toUpperCase() === val) ?? result.items[0]

      if (!match) {
        setManualErr(`No asset found for "${val}"`)
        return
      }

      setOpen(false)
      router.push(`/assets/${match.id}`)
    } catch {
      setManualErr('Search failed — please try again')
    } finally {
      setResolving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger */}
      <div
        className={cn('cursor-pointer', className)}
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setOpen(true)}
      >
        {trigger ?? (
          <button
            type="button"
            className={cn(
              'fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center',
              'rounded-full bg-primary text-primary-foreground shadow-xl',
              'hover:bg-primary/90 active:scale-95 transition-transform',
              'lg:hidden', // mobile only — desktop uses toolbar button
            )}
            aria-label="Scan asset QR code"
          >
            <QrCode className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Dialog */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) void stopScanner()
          setOpen(v)
          if (v) setMode('camera')
          setManualVal('')
          setManualErr(null)
          setCamError(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Scan Asset QR Code
            </DialogTitle>
            <DialogDescription>
              Point your camera at an asset QR code, or enter the asset number manually.
            </DialogDescription>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="flex rounded-lg border overflow-hidden text-sm">
            <button
              type="button"
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors',
                mode === 'camera' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
              onClick={() => setMode('camera')}
            >
              <Camera className="h-4 w-4" />
              Camera
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors',
                mode === 'manual' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
              onClick={() => {
                void stopScanner()
                setMode('manual')
              }}
            >
              <Keyboard className="h-4 w-4" />
              Manual
            </button>
          </div>

          {/* Camera view */}
          {mode === 'camera' && (
            <div className="space-y-3">
              <div
                className="relative overflow-hidden rounded-lg bg-black"
                style={{ aspectRatio: '1/1' }}
              >
                <div id={containerId} className="absolute inset-0" />
                {!scanning && !camError && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-white/60" />
                  </div>
                )}
              </div>

              {camError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{camError}</span>
                </div>
              )}

              {camError && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => void startScanner()}
                >
                  Retry camera
                </Button>
              )}

              <p className="text-center text-xs text-muted-foreground">
                Align the QR code within the viewfinder
              </p>
            </div>
          )}

          {/* Manual input */}
          {mode === 'manual' && (
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="asset-number-input">Asset Number</Label>
                <Input
                  id="asset-number-input"
                  placeholder="e.g. AST-000042"
                  value={manualVal}
                  onChange={(e) => {
                    setManualVal(e.target.value)
                    setManualErr(null)
                  }}
                  autoFocus
                  autoCapitalize="characters"
                />
                {manualErr && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {manualErr}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={!manualVal.trim() || resolving}>
                {resolving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Looking up…
                  </>
                ) : (
                  'Go to Asset'
                )}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
