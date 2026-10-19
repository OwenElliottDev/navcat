import type { LngLat } from '../types'

// Shared links, in OpenStreetMap's formats (https://wiki.openstreetmap.org/wiki/Browsing) on
// this instance's own address, so a link from openstreetmap.org opens here too

/** The map view a link opens at, and the spot it marks, if any */
interface LinkedView {
  center: LngLat
  zoom: number
  marker: LngLat | null
}

/** The most a shortlink holds: 10 characters of 3 bits each way, less 8 */
const MAX_ZOOM = 22
/** How far in a shared spot's link zooms at least: a shortlink is only as precise as its zoom */
const SPOT_ZOOM = 16

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_~'

/** The OSM shortlink code for a view, as in osm.org/go/<code> (as OSM's lib/short_link.rb) */
export function encodeShortlink({ lng, lat }: LngLat, zoom: number): string {
  // The far edges (180°E, the North Pole) would overflow the 32 bits and wrap to the other side
  const x = BigInt(Math.min(Math.floor(((lng + 180) * 2 ** 32) / 360), 2 ** 32 - 1))
  const y = BigInt(Math.min(Math.floor(((lat + 90) * 2 ** 32) / 180), 2 ** 32 - 1))
  // The bits of x and y in turn, so each character narrows both down
  let bits = 0n
  for (let i = 31n; i >= 0n; i--) bits = (bits << 2n) | (((x >> i) & 1n) << 1n) | ((y >> i) & 1n)

  let code = ''
  for (let i = 0; i < Math.ceil((zoom + 8) / 3); i++) {
    code += ALPHABET[Number((bits >> BigInt(58 - 6 * i)) & 63n)]
  }
  return code + '-'.repeat((zoom + 8) % 3)
}

/** The view an OSM shortlink code points at; null for one too short to place */
export function decodeShortlink(code: string): { center: LngLat; zoom: number } | null {
  let x = 0n
  let y = 0n
  let bits = 0
  let padding = 0
  // "@" is the old spelling of "~"
  for (const c of code.replace(/@/g, '~')) {
    const value = ALPHABET.indexOf(c)
    if (value < 0) {
      padding++
      continue
    }
    // Each character holds 3 bits of x and 3 of y, in turn
    for (let i = 2; i >= 0; i--) {
      x = (x << 1n) | BigInt((value >> (2 * i + 1)) & 1)
      y = (y << 1n) | BigInt((value >> (2 * i)) & 1)
    }
    bits += 3
  }
  // "-" means two zoom levels fewer than the characters hold, "--" one fewer
  const zoom = bits - 8 - ((3 - (padding % 3)) % 3)
  if (zoom < 0) return null
  const shift = BigInt(32 - bits)
  const lng = (Number(x << shift) * 360) / 2 ** 32 - 180
  const lat = (Number(y << shift) * 180) / 2 ** 32 - 90
  return { center: { lng, lat }, zoom }
}

/** A link to a spot on the map, to share: this instance's address with a marked shortlink. */
export function shareLink(at: LngLat, zoom = SPOT_ZOOM, origin = location.origin): string {
  const z = Math.min(Math.max(Math.round(zoom), SPOT_ZOOM), MAX_ZOOM)
  return `${origin}/go/${encodeShortlink(at, z)}?m`
}

/**
 * What a link to this app asks to show, in any of OSM's formats: /go/<code> (?m to mark it),
 * #map=<zoom>/<lat>/<lon>, ?mlat=…&mlon=… for a marker, or the older ?lat=…&lon=…&zoom=….
 */
export function parseLink({ pathname, searchParams, hash }: URL): LinkedView | null {
  const go = pathname.match(/^\/go\/([A-Za-z0-9_~@]{1,10}-{0,2})$/)
  if (go) {
    const view = decodeShortlink(go[1])
    return view && { ...view, marker: searchParams.has('m') ? view.center : null }
  }

  // Number, not parseFloat, so "-37.8abc" is no number rather than -37.8
  const param = (name: string) => number(searchParams.get(name))
  const map = hash.match(/^#map=([^/]+)\/([^/]+)\/([^/&]+)/)
  const marker = point(param('mlat'), param('mlon'))
  const center = map ? point(number(map[2]), number(map[3])) : point(param('lat'), param('lon'))
  const zoom = map ? number(map[1]) : param('zoom')

  if (!center && !marker) return null
  return {
    center: center ?? marker!,
    zoom: zoom >= 0 && zoom <= MAX_ZOOM ? zoom : SPOT_ZOOM,
    marker,
  }
}

/** A number written out in full; NaN for anything else, including nothing */
function number(text: string | null): number {
  return text?.trim() ? Number(text) : NaN
}

/** A point, if these are a latitude and longitude (not missing, or out of range) */
function point(lat: number, lng: number): LngLat | null {
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lng, lat } : null
}
