import { describe, expect, it } from 'vitest'
import { boundsOf, decodePolyline, distanceInMetres, isNear } from './geo'

describe('decodePolyline', () => {
  it("decodes Google's example", () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ])
    expect(decodePolyline('')).toEqual([])
  })
})

describe('distanceInMetres', () => {
  it('measures great-circle distance', () => {
    const flinders = { lng: 144.9671, lat: -37.8183 }
    const sydney = { lng: 151.2069, lat: -33.8688 }
    expect(distanceInMetres(flinders, sydney) / 1000).toBeCloseTo(714, -1)
    expect(distanceInMetres(flinders, flinders)).toBe(0)
  })

  it('tells when points are near', () => {
    const a = { lng: 145, lat: -37.8 }
    expect(isNear(a, { lng: 145.0002, lat: -37.8 })).toBe(true) // ~18 m
    expect(isNear(a, { lng: 145.0004, lat: -37.8 })).toBe(false) // ~35 m
    expect(isNear(a, { lng: 145.0004, lat: -37.8 }, 50)).toBe(true)
  })
})

describe('boundsOf', () => {
  it('boxes every line', () => {
    const line = (...coordinates: [number, number][]) => ({
      type: 'LineString' as const,
      coordinates,
    })
    expect(boundsOf([line([145, -37], [146, -38]), line([144.5, -37.5])])).toEqual([
      144.5, -38, 146, -37,
    ])
    expect(boundsOf([])).toBeNull()
    expect(boundsOf([line()])).toBeNull()
  })
})
