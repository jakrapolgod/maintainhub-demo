export function formatThaiDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso as string)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatThaiDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso as string)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatThaiDateShort(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso as string)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

export function formatRelativeThai(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso as string)
  if (isNaN(d.getTime())) return '—'
  const diffMs = Date.now() - d.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffMins < 1) return 'เพิ่งกี้'
  if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`
  if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`
  if (diffDays < 30) return `${diffDays} วันที่แล้ว`
  return formatThaiDate(iso)
}
