import type { LngLat } from '../types'
import { bearingBetween, distanceInMetres } from './geo'

// Which way you're facing, from the compass and GPS. Pure functions: hooks/useCompass.ts and
// hooks/useNavigation.ts feed them sensor readings. Headings are degrees clockwise from north.

/** A GPS reading. */
export interface Fix {
  at: LngLat
  /** Metres */
  accuracy: number
  /** Direction of travel in degrees from north, when the device knows */
  heading: number | null
  /** Metres a second, when the device knows */
  speed: number | null
  /** Milliseconds since the epoch */
  time: number
}

/** The turn from a to b, -180 to 180 (positive is clockwise). */
export function angleDifference(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180
}

/** Moves `from` a fraction of the way towards `to`, the short way round. */
export function smoothAngle(from: number, to: number, fraction: number): number {
  return (from + angleDifference(from, to) * fraction + 360) % 360
}

/**
 * The compass direction from a device's absolute orientation (W3C Euler angles). Held up, it's
 * the way the back of the phone points (whatever the screen's rotation); lying flat, it's the
 * way the top of the screen points.
 */
export function compassFromOrientation(
  alpha: number,
  beta: number,
  gamma: number,
  screenAngle: number,
): number {
  const rad = Math.PI / 180
  const [x, y, z] = [beta * rad, gamma * rad, alpha * rad]
  // The back of the device, projected onto the ground
  const east = -Math.cos(z) * Math.sin(y) - Math.sin(z) * Math.sin(x) * Math.cos(y)
  const north = -Math.sin(z) * Math.sin(y) + Math.cos(z) * Math.sin(x) * Math.cos(y)
  if (Math.hypot(east, north) > 0.3) return (Math.atan2(east, north) / rad + 360) % 360
  return (360 - alpha + screenAngle + 360) % 360
}

/** How you're moving, worked out over successive fixes. */
export interface Movement {
  /** Degrees from north, or null when not really moving */
  course: number | null
  /** Metres a second, or null until it's known */
  speed: number | null
  /** The fix the direction of travel is next measured from */
  anchor: Fix | null
}

export const STILL: Movement = { course: null, speed: null, anchor: null }

// Slower than this (m/s) and the direction of travel is too unsure to use
const MOVING_SPEED = 1
// Without a direction from the device, it's measured over at least this far (metres) ...
const COURSE_OVER = 8
// ... between fixes no more than this far apart (ms), from fixes at least this accurate (metres)
const COURSE_WITHIN_MS = 8000
const COURSE_ACCURACY = 25
// Faster than this (m/s), the direction of travel says more about where you're facing than the
// compass does
const COURSE_OVER_COMPASS_SPEED = 2

/** Movement after a new fix: the device's direction of travel, or measured from an earlier fix. */
export function measureMovement(last: Movement, fix: Fix): Movement {
  const speed = fix.speed ?? last.speed
  if (fix.heading !== null && !Number.isNaN(fix.heading) && fix.speed !== null) {
    return { course: fix.speed >= MOVING_SPEED ? fix.heading : null, speed, anchor: fix }
  }
  if (fix.accuracy > COURSE_ACCURACY) return { ...last, speed }
  const { anchor } = last
  if (!anchor) return { ...last, speed, anchor: fix }
  const moved = distanceInMetres(anchor.at, fix.at)
  const elapsed = fix.time - anchor.time
  if (moved < COURSE_OVER && elapsed <= COURSE_WITHIN_MS) return { ...last, speed }
  const measured = elapsed > 0 ? moved / (elapsed / 1000) : 0
  return {
    course: measured >= MOVING_SPEED ? bearingBetween(anchor.at, fix.at) : null,
    speed: fix.speed ?? measured,
    anchor: fix,
  }
}

/** Moving fast enough to go by the direction of travel rather than the compass. */
export const isMovingBriskly = (speed: number | null) => (speed ?? 0) >= COURSE_OVER_COMPASS_SPEED

/**
 * The way you're facing: the direction of travel when moving briskly (in a car the phone may
 * point anywhere), else the compass, else whatever's known.
 */
export function facingHeading(
  course: number | null,
  speed: number | null,
  compass: number | null,
): number | null {
  if (course !== null && isMovingBriskly(speed)) return course
  return compass ?? course
}

// Within LOCK of the route's direction, the camera faces down the route (steadier, and it turns
// just before corners); further than UNLOCK, it faces the way you are. The gap stops it flicking.
const LOCK_WITHIN = 45
const UNLOCK_BEYOND = 75

/** Whether the camera should keep facing down the route, given whether it was already. */
export function followsRoute(facing: number | null, route: number | null, wasFollowing: boolean) {
  if (route === null) return false
  if (facing === null) return true
  const off = Math.abs(angleDifference(facing, route))
  return wasFollowing ? off <= UNLOCK_BEYOND : off <= LOCK_WITHIN
}
