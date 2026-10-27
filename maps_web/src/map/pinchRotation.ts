import type { Map } from 'maplibre-gl'

/** How far two fingers must twist (in degrees) before the map starts to rotate */
const DEAD_ZONE = 15
/** And how far (in pixels) they must move around the circle between them, so fingers close
 * together don't rotate the map with a little jitter (MapLibre's own threshold is 25) */
const MIN_ARC = 10
/** Pinch speeds, in zoom levels a second: twist made while zooming slower than SLOW_ZOOM all
 * counts towards the dead-zone, and twist made while zooming faster than FAST_ZOOM none of it,
 * unless the fingers are mostly turning (below) */
const SLOW_ZOOM = 1
const FAST_ZOOM = 4
/** How much of the fingers' movement is turning rather than spreading (0–1): above MOSTLY_TURNING
 * all of a twist counts however fast the zoom, and below HALF_TURNING the zoom speed decides, so
 * a quick twist that also changes the fingers' gap a little still rotates */
const HALF_TURNING = 0.55
const MOSTLY_TURNING = 0.75
/** How much of each move's speed goes into the pinch's measured speeds (0–1), so one jittery
 * touch event doesn't swing them */
const SMOOTHING = 0.3

type Vector = { x: number; y: number }

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * How much of a twist counts towards the dead-zone while zooming at `zoomSpeed` (zoom levels a
 * second) and turning at `turnSpeed` (degrees a second).
 */
export function twistWeight(zoomSpeed: number, turnSpeed: number): number {
  // Each finger's speed along and around the circle between them, in radii a second
  const along = zoomSpeed * Math.LN2
  const around = (turnSpeed * Math.PI) / 180
  const turning = along + around > 0 ? around / (along + around) : 0
  return Math.max(
    clamp01((FAST_ZOOM - zoomSpeed) / (FAST_ZOOM - SLOW_ZOOM)),
    clamp01((turning - HALF_TURNING) / (MOSTLY_TURNING - HALF_TURNING)),
  )
}

/** The signed angle from `a` to `b`, in degrees */
function angle(a: Vector, b: Vector): number {
  return (Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y) * 180) / Math.PI
}

/**
 * Decides when a two-finger pinch starts rotating the map. Twist made while zooming fast is
 * discounted as sloppiness; twist made while zooming slowly or mostly turning counts. Nothing
 * counts until the pinch's speed is known, and the fingers must also have turned past the dead
 * zone from where they started, in the same direction.
 */
export class PinchTwist {
  private countedTwist = 0
  private turnedFromStart = 0
  private zoomSpeed?: number
  private turnSpeed = 0
  private vector: Vector
  private length: number
  private minLength: number
  private lastMoveTime?: number

  constructor(vector: Vector) {
    this.vector = vector
    this.length = this.minLength = Math.hypot(vector.x, vector.y)
  }

  /** Moves the fingers to `vector` (from one to the other) at `time` (ms, the touch event's);
   * returns whether the map should still hold its bearing */
  move(vector: Vector, time: number): boolean {
    const twist = angle(this.vector, vector)
    const length = Math.hypot(vector.x, vector.y)
    const seconds = this.lastMoveTime === undefined ? 0 : (time - this.lastMoveTime) / 1000
    if (seconds > 0) {
      const zoom = Math.abs(Math.log2(length / this.length)) / seconds
      const turn = Math.abs(twist) / seconds
      if (this.zoomSpeed === undefined) {
        this.zoomSpeed = zoom
        this.turnSpeed = turn
      } else {
        this.zoomSpeed += (zoom - this.zoomSpeed) * SMOOTHING
        this.turnSpeed += (turn - this.turnSpeed) * SMOOTHING
      }
    }
    if (this.zoomSpeed !== undefined) {
      this.countedTwist += twist * twistWeight(this.zoomSpeed, this.turnSpeed)
    }
    this.turnedFromStart += twist
    this.vector = vector
    this.length = length
    this.minLength = Math.min(this.minLength, length)
    this.lastMoveTime = time

    if (Math.abs(this.countedTwist) < DEAD_ZONE) return true
    // Turned past the dead-zone, and MIN_ARC at the fingers' closest, the way the twist counted
    const arc = (MIN_ARC / (Math.PI * this.minLength)) * 360
    return this.turnedFromStart * Math.sign(this.countedTwist) < Math.max(DEAD_ZONE, arc)
  }
}

/** Puts PinchTwist in place of MapLibre's two-finger rotation threshold */
export function steadyPinchRotation(map: Map) {
  const rotate = map.touchZoomRotate._touchRotate
  // These are MapLibre's internals: if an update changes them, keep its own rotation instead
  if (
    typeof rotate?._start !== 'function' ||
    typeof rotate._move !== 'function' ||
    typeof rotate._isBelowThreshold !== 'function'
  ) {
    console.warn('MapLibre has changed: two-finger rotation uses its own threshold')
    return
  }
  let pinch: PinchTwist | undefined
  let now = 0
  const start = rotate._start.bind(rotate)
  rotate._start = (points) => {
    start(points)
    pinch = new PinchTwist(points[0].sub(points[1]))
  }
  // The touch event's timestamp: when the fingers moved, not when the handler ran
  const move = rotate._move.bind(rotate)
  rotate._move = (points, pinchAround, e) => {
    now = e.timeStamp
    return move(points, pinchAround, e)
  }
  // MapLibre's own threshold is a fixed arc length and ignores zooming, so replace it
  rotate._isBelowThreshold = (vector) => pinch?.move(vector, now) ?? true
}
