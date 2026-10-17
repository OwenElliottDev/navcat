import type { Map } from 'maplibre-gl'

/** How far two fingers must twist (in degrees) before the map starts to rotate */
const DEAD_ZONE = 15

/**
 * Whether a pinch that has twisted `twist` degrees so far should still hold the map's bearing.
 * A pinch that starts zooming first never rotates, so plain zooms keep the map steady; one that
 * twists past the dead-zone first rotates and zooms together.
 */
export function holdsBearing(twist: number, zoomStarted: boolean): boolean {
  return zoomStarted || Math.abs(twist) < DEAD_ZONE
}

/** Makes two-finger rotation behave as above. */
export function steadyPinchRotation(map: Map) {
  const touch = map.touchZoomRotate
  const rotate = touch._touchRotate
  // MapLibre's own threshold is a fixed arc length and ignores zooming, so replace it
  rotate._isBelowThreshold = (vector) => {
    const twist = (vector.angleWith(rotate._startVector!) * 180) / Math.PI
    return holdsBearing(twist, touch._touchZoom.isActive())
  }
}
