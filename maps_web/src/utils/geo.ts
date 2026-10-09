import type { Bounds, LineString, LngLat } from '../types'

/** Great-circle distance between two points. */
export function distanceInMetres(a: LngLat, b: LngLat): number {
  const R = 6_371_000
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** The box around all the lines, or null if there are no points. */
export function boundsOf(lines: LineString[]): Bounds | null {
  const points = lines.flatMap((line) => line.coordinates)
  if (!points.length) return null
  const lngs = points.map(([lng]) => lng)
  const lats = points.map(([, lat]) => lat)
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]
}

/** Decodes a Google encoded polyline (precision 5) into [lng, lat] pairs. */
export function decodePolyline(encoded: string): [number, number][] {
  const coordinates: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0

  const nextValue = () => {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }

  while (index < encoded.length) {
    lat += nextValue()
    lng += nextValue()
    coordinates.push([lng / 1e5, lat / 1e5])
  }
  return coordinates
}

/** True when two points are within `metres` of each other. */
export function isNear(a: LngLat, b: LngLat, metres = 25): boolean {
  return distanceInMetres(a, b) <= metres
}
