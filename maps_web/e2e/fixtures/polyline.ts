/** Encodes [lng, lat] pairs as a Google polyline (precision 5), as OpenTripPlanner sends them. */
export function encodePolyline(points: [number, number][]): string {
  let lastLat = 0
  let lastLng = 0
  let out = ''
  const encode = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
      v >>= 5
    }
    out += String.fromCharCode(v + 63)
  }
  for (const [lng, lat] of points) {
    const latE5 = Math.round(lat * 1e5)
    const lngE5 = Math.round(lng * 1e5)
    encode(latE5 - lastLat)
    encode(lngE5 - lastLng)
    lastLat = latE5
    lastLng = lngE5
  }
  return out
}
