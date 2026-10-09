import { humanize } from './format'

const LABELS: Record<string, string> = {
  RAIL: 'Train',
  SUBWAY: 'Metro',
  TRAM: 'Tram',
  BUS: 'Bus',
  COACH: 'Coach',
  FERRY: 'Ferry',
  WALK: 'Walk',
}

// The order mode toggles are shown in; anything else goes after
const ORDER = ['RAIL', 'SUBWAY', 'TRAM', 'BUS', 'COACH', 'FERRY']

/** "RAIL" -> "Train", "CABLE_CAR" -> "Cable car" */
export function transitModeLabel(mode: string): string {
  return LABELS[mode] ?? humanize(mode.toLowerCase())
}

export function sortTransitModes(modes: string[]): string[] {
  const rank = (mode: string) => (ORDER.includes(mode) ? ORDER.indexOf(mode) : ORDER.length)
  return modes.toSorted((a, b) => rank(a) - rank(b))
}
