import type { Instruction, LngLat, RoutePath } from '../types'
import { bearingBetween, distanceInMetres } from './geo'
import { angleDifference } from './heading'

// Turn-by-turn guidance worked out from a GraphHopper route and a position. Pure functions:
// hooks/useNavigation.ts feeds them GPS fixes.

/** A route prepared for following: how far along it each point is. */
export interface NavRoute {
  path: RoutePath
  points: [number, number][]
  /** Metres from the start to each point */
  along: number[]
  length: number
}

/** Where a position is relative to the route. */
export interface RouteProgress {
  /** The nearest point on the route */
  snapped: LngLat
  /** The stretch of route it's on: from points[segment] to points[segment + 1] */
  segment: number
  /** Metres travelled along the route */
  along: number
  /** Metres between the position and the route */
  offRoute: number
  /** Direction of the route here, in degrees clockwise from north */
  bearing: number
}

export interface Guidance {
  /** The manoeuvre coming up, or null once there's nothing left but arriving */
  next: Instruction | null
  /** Its index in path.instructions, to tell when it changes */
  nextIndex: number
  /** Metres until it */
  toNext: number
  remainingDistance: number
  /** Milliseconds */
  remainingTime: number
  arrived: boolean
}

/** Close enough to the end to count as arrived */
const ARRIVED_WITHIN = 25

export function prepareRoute(path: RoutePath): NavRoute {
  const points = path.points.coordinates.map(([lng, lat]) => [lng, lat] as [number, number])
  const along = [0]
  for (let i = 1; i < points.length; i++) {
    along.push(along[i - 1] + distanceInMetres(toLngLat(points[i - 1]), toLngLat(points[i])))
  }
  return { path, points, along, length: along[along.length - 1] ?? 0 }
}

const toLngLat = ([lng, lat]: [number, number]): LngLat => ({ lng, lat })

/**
 * Snaps a position onto the route. `near` is the segment from the last fix: searching from
 * there (mostly ahead) stops the snap jumping to another part of a route that doubles back.
 */
export function locate(route: NavRoute, at: LngLat, near?: number): RouteProgress {
  const last = route.points.length - 2
  const searchFrom = near === undefined ? 0 : Math.max(0, near - 5)
  const searchTo = near === undefined ? last : Math.min(last, near + 150)

  let best = closestOnSegments(route, at, searchFrom, searchTo)
  // Lost the thread (or a long gap between fixes): look at the whole route
  if (near !== undefined && best.offRoute > 100) {
    const anywhere = closestOnSegments(route, at, 0, last)
    if (anywhere.offRoute < best.offRoute) best = anywhere
  }
  return best
}

function closestOnSegments(route: NavRoute, at: LngLat, from: number, to: number): RouteProgress {
  // Flat metres around the position: plenty accurate over a few hundred metres
  const metresPerLng = 111_320 * Math.cos((at.lat * Math.PI) / 180)
  const metresPerLat = 110_540
  const toXY = ([lng, lat]: [number, number]) => [
    (lng - at.lng) * metresPerLng,
    (lat - at.lat) * metresPerLat,
  ]

  let best: RouteProgress | null = null
  for (let i = from; i <= Math.max(from, to); i++) {
    const a = route.points[i]
    const b = route.points[i + 1] ?? a
    const [ax, ay] = toXY(a)
    const [bx, by] = toXY(b)
    const dx = bx - ax
    const dy = by - ay
    const lengthSq = dx * dx + dy * dy
    const t = lengthSq ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSq)) : 0
    const offRoute = Math.hypot(ax + t * dx, ay + t * dy)
    if (!best || offRoute < best.offRoute) {
      const segmentLength = (route.along[i + 1] ?? route.along[i]) - route.along[i]
      best = {
        snapped: { lng: a[0] + t * (b[0] - a[0]), lat: a[1] + t * (b[1] - a[1]) },
        segment: i,
        along: route.along[i] + t * segmentLength,
        offRoute,
        bearing: bearingBetween(toLngLat(a), toLngLat(b)),
      }
    }
  }
  return best!
}

/** What to tell the user, given where they are on the route. */
export function guide(route: NavRoute, progress: RouteProgress): Guidance {
  const instructions = route.path.instructions

  // The instruction whose stretch of road the position is on
  let current = 0
  instructions.forEach((instruction, i) => {
    if (instruction.interval[0] <= progress.segment) current = i
  })

  const nextIndex = current + 1 < instructions.length ? current + 1 : -1
  const next = nextIndex === -1 ? null : instructions[nextIndex]
  const nextAt = next ? route.along[next.interval[0]] : route.length
  const remainingDistance = Math.max(0, route.length - progress.along)

  // Time left: the rest of this stretch, in proportion, plus everything after it
  const [start, end] = instructions[current].interval
  const stretch = route.along[end] - route.along[start]
  const leftOfStretch =
    stretch > 0 ? Math.min(1, Math.max(0, (route.along[end] - progress.along) / stretch)) : 0
  const remainingTime =
    instructions[current].time * leftOfStretch +
    instructions.slice(current + 1).reduce((sum, instruction) => sum + instruction.time, 0)

  return {
    next,
    nextIndex,
    toNext: Math.max(0, nextAt - progress.along),
    remainingDistance,
    remainingTime,
    arrived: remainingDistance < ARRIVED_WITHIN,
  }
}

/**
 * Too far from the route to be on it: further than `threshold` metres, allowing for how unsure
 * the fix is, and outside the fix's own accuracy. Very rough fixes don't count either way.
 */
export function isOffRoute(progress: RouteProgress, accuracy: number, threshold: number) {
  const margin = Math.max(threshold + Math.min(accuracy, 30), accuracy)
  return accuracy < 100 && progress.offRoute > margin
}

/** The start of a route is left out: a new route may begin with turning around */
const WRONG_WAY_AFTER = 50

/** Travelling back along the route, against its direction. */
export function isWrongWay(progress: RouteProgress, course: number | null) {
  if (course === null || progress.along < WRONG_WAY_AFTER) return false
  return Math.abs(angleDifference(course, progress.bearing)) > 120
}

/** The point `distance` metres along the route (for simulating a trip). */
export function pointAlong(route: NavRoute, distance: number): LngLat {
  const d = Math.min(Math.max(distance, 0), route.length)
  let i = route.along.findIndex((a) => a > d)
  if (i === -1) return toLngLat(route.points[route.points.length - 1])
  i = Math.max(1, i)
  const a = route.points[i - 1]
  const b = route.points[i]
  const span = route.along[i] - route.along[i - 1]
  const t = span ? (d - route.along[i - 1]) / span : 0
  return { lng: a[0] + t * (b[0] - a[0]), lat: a[1] + t * (b[1] - a[1]) }
}
