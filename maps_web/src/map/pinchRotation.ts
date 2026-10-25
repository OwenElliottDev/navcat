import type { Map } from 'maplibre-gl'

/** How far two fingers must twist (in degrees) before the map starts to rotate */
const DEAD_ZONE = 15
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

/**
 * Follows a two-finger pinch to decide when it should start rotating the map. Twists made while
 * zooming quickly are sloppiness, so plain zooms keep the map steady, even when the fingers slow
 * down before lifting; twists made while zooming slowly, or not at all, or mostly turning, are
 * meant.
 */
export class PinchTwist {
  private twist = 0
  private zoomSpeed?: number
  private turnSpeed = 0
  private vector: Vector
  private time: number

  constructor(vector: Vector, time: number) {
    this.vector = vector
    this.time = time
  }

  /** Moves the fingers to `vector` (from one to the other) at `time` (ms); returns whether the
   * map should still hold its bearing */
  move(vector: Vector, time: number): boolean {
    const { x, y } = this.vector
    const twist =
      (Math.atan2(x * vector.y - y * vector.x, x * vector.x + y * vector.y) * 180) / Math.PI
    const seconds = (time - this.time) / 1000
    if (seconds > 0) {
      const zoom = Math.abs(Math.log2(Math.hypot(vector.x, vector.y) / Math.hypot(x, y))) / seconds
      const turn = Math.abs(twist) / seconds
      if (this.zoomSpeed === undefined) {
        this.zoomSpeed = zoom
        this.turnSpeed = turn
      } else {
        this.zoomSpeed += (zoom - this.zoomSpeed) * SMOOTHING
        this.turnSpeed += (turn - this.turnSpeed) * SMOOTHING
      }
    }
    this.twist += twist * twistWeight(this.zoomSpeed ?? 0, this.turnSpeed)
    this.vector = vector
    this.time = time
    return Math.abs(this.twist) < DEAD_ZONE
  }
}

/** Makes two-finger rotation behave as above. */
export function steadyPinchRotation(map: Map) {
  const rotate = map.touchZoomRotate._touchRotate
  let pinch: PinchTwist | undefined
  let now = 0
  const start = rotate._start.bind(rotate)
  rotate._start = (points) => {
    start(points)
    pinch = new PinchTwist(rotate._startVector!, performance.now())
  }
  // Touch events' own times, which are when the fingers moved rather than when it was handled
  const move = rotate._move.bind(rotate)
  rotate._move = (points, pinchAround, e) => {
    now = e.timeStamp
    return move(points, pinchAround, e)
  }
  // MapLibre's own threshold is a fixed arc length and ignores zooming, so replace it
  rotate._isBelowThreshold = (vector) => pinch?.move(vector, now) ?? true
}
