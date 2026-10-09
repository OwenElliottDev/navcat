import type { RoutePath } from '../types'

// Lane guidance: which lanes to be in for a turn, from OSM's turn:lanes on the road leading
// into it (looked up by the backend; see api/lanes.ts).

/** One lane: the ways it goes ("left", "through", ...), and whether to be in it. */
export interface Lane {
  directions: string[]
  active: boolean
}

/** The road a route takes into a turn: its OSM way, and two points on it in travel order. */
export interface Approach {
  wayId: number
  start: [number, number]
  end: [number, number]
}

// For each turn sign, the lane markings that suit it, best first. Unmarked lanes go straight on.
const WANTED: Record<number, string[]> = {
  [-3]: ['sharp_left', 'left'],
  [-2]: ['left', 'sharp_left', 'slight_left'],
  [-1]: ['slight_left', 'left'],
  0: ['through', 'none'],
  1: ['slight_right', 'right'],
  2: ['right', 'sharp_right', 'slight_right'],
  3: ['sharp_right', 'right'],
  [-7]: ['slight_left', 'through', 'left'], // keep left
  7: ['slight_right', 'through', 'right'], // keep right
  [-98]: ['reverse'], // u-turn
  [-8]: ['reverse'],
  8: ['reverse'],
}

/**
 * Where to look up lanes for each of a route's instructions: the stretch of road just before
 * the turn. null for the start, roundabouts and arriving, which have no lanes to show.
 */
export function approaches(path: RoutePath): (Approach | null)[] {
  const ways = path.details?.osm_way_id ?? []
  const points = path.points.coordinates
  return path.instructions.map((instruction, i) => {
    const at = instruction.interval[0]
    if (i === 0 || !(instruction.sign in WANTED) || at < 1) return null
    const way = ways.find(([from, to]) => from <= at - 1 && at - 1 < to)
    if (!way) return null
    const [startLng, startLat] = points[at - 1]
    const [endLng, endLat] = points[at]
    return { wayId: way[2], start: [startLng, startLat], end: [endLng, endLat] }
  })
}

/**
 * The lanes from a turn:lanes value (e.g. "left|through|through;right"), with the ones that
 * suit the turn marked. null when there's nothing worth showing: one lane, or none that fit.
 */
export function parseLanes(value: string, sign: number): Lane[] | null {
  const lanes = value.split('|').map((lane) =>
    lane
      .split(';')
      .map((direction) => direction.trim() || 'none')
      .filter(Boolean),
  )
  if (lanes.length < 2) return null

  const wanted = (WANTED[sign] ?? []).find((direction) =>
    lanes.some((directions) => directions.includes(direction)),
  )
  if (!wanted) return null
  const active = lanes.map((directions) => directions.includes(wanted))

  // Keeping left or right at a fork on through lanes: the half on that side
  const keep = sign === -7 ? 'left' : sign === 7 ? 'right' : null
  if (keep && wanted === 'through') {
    const matching = active.flatMap((isActive, i) => (isActive ? [i] : []))
    const half = Math.ceil(matching.length / 2)
    const side = keep === 'left' ? matching.slice(0, half) : matching.slice(-half)
    active.forEach((_, i) => (active[i] = side.includes(i)))
  }
  return lanes.map((directions, i) => ({ directions, active: active[i] }))
}
