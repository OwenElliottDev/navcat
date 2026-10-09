import { describe, expect, it } from 'vitest'
import { fileSlug, toGpx } from './gpx'

describe('toGpx', () => {
  it('writes a track, escaping the name, with elevation when known', () => {
    const gpx = toGpx('Walk: "Tom & Jerry\'s" <route>', {
      type: 'LineString',
      coordinates: [
        [144.9631, -37.8136, 31.25],
        [144.9641, -37.8146],
      ],
    })
    expect(gpx).toContain('<name>Walk: &quot;Tom &amp; Jerry&apos;s&quot; &lt;route&gt;</name>')
    expect(gpx).toContain('<trkpt lat="-37.813600" lon="144.963100"><ele>31.3</ele></trkpt>')
    expect(gpx).toContain('<trkpt lat="-37.814600" lon="144.964100"></trkpt>')
    expect(gpx.match(/<trkpt /g)).toHaveLength(2)
  })
})

describe('fileSlug', () => {
  it('makes a safe file name', () => {
    expect(fileSlug('Walk: Flinders Street to Brunswick')).toBe('walk-flinders-street-to-brunswick')
    expect(fileSlug('  ***  ')).toBe('route')
    expect(fileSlug('a'.repeat(100))).toHaveLength(80)
  })
})
