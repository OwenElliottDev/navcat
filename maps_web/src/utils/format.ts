import type { LngLat } from '../types'

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`
  if (metres < 100_000) return `${(metres / 1000).toFixed(1)} km`
  return `${Math.round(metres / 1000)} km`
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${Math.max(minutes, 1)} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/** "8:05 am", in the viewer's time zone. */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** "4 Oct 2026" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** "fast_food" -> "Fast food" */
export function humanize(value?: string): string {
  if (!value) return ''
  return value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

export function coordLabel(at: LngLat): string {
  return `${at.lat.toFixed(5)}, ${at.lng.toFixed(5)}`
}
