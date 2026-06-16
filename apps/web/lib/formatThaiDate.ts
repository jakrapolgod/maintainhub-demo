const THAI_DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  calendar: 'buddhist',
}

const THAI_DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  calendar: 'buddhist',
}

const THAI_SHORT_OPTS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  calendar: 'buddhist',
}

function toDate(iso: string | Date | null | undefined): Date | null {
  if (!iso) return null
  const d = iso instanceof Date ? iso : new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

export function formatThaiDate(iso: string | Date | null | undefined): string {
  const d = toDate(iso)
  if (!d) return '—'
  return d.toLocaleDateString('th-TH', THAI_DATE_OPTS)
}

export function formatThaiDateTime(iso: string | Date | null | undefined): string {
  const d = toDate(iso)
  if (!d) return '—'
  return d.toLocaleString('th-TH', THAI_DATETIME_OPTS)
}

export function formatThaiDateShort(iso: string | Date | null | undefined): string {
  const d = toDate(iso)
  if (!d) return '—'
  return d.toLocaleDateString('th-TH', THAI_SHORT_OPTS)
}

export function formatRelativeThai(iso: string | Date | null | undefined): string {
  const d = toDate(iso)
  if (!d) return '—'
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'เพิ่งกี้'
  if (diffMin < 60) return `${diffMin} น. ที่แล้ว`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} ชม. ที่แล้ว`
  return `${Math.floor(diffHr / 24)} วันที่แล้ว`
}
