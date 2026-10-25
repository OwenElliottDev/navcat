import { describe, expect, it } from 'vitest'
import { decodeShortlink, encodeShortlink, parseLink, shareLink } from './links'

const url = (path: string) => new URL(path, 'https://maps.example')

describe('encodeShortlink', () => {
  // Codes from maps_backend/app/short_link.py, which follows openstreetmap.org's
  it.each([
    [144.96706, -37.81827, 16, 'uG4HPHpJ'],
    [144.9631, -37.8136, 15, 'uG4HYp~Z--'],
    [0, 0, 0, 'wAA--'],
    [-122.4194, 37.7749, 12, 'TZHvSR7--'],
    [179.99999, 89.99999, 22, '~~~~~~~~gY'],
    [-180, -90, 5, 'AAAAA-'],
    [151.2093, -33.8688, 18, 'uN~ROOdVC--'],
  ])('%f, %f at zoom %i is %s', (lng, lat, zoom, code) => {
    expect(encodeShortlink({ lng, lat }, zoom)).toBe(code)
  })

  it("keeps the far edges on their side, where they'd overflow", () => {
    expect(decodeShortlink(encodeShortlink({ lng: 0, lat: 90 }, 16))!.center.lat).toBeCloseTo(90, 3)
    expect(decodeShortlink(encodeShortlink({ lng: 180, lat: 0 }, 16))!.center.lng).toBeCloseTo(
      180,
      3,
    )
  })
})

describe('decodeShortlink', () => {
  // A code holds its view to within its last character's cell, from the cell's corner
  it.each([
    ['uG4HPHpJ', 144.96706, -37.81827, 16],
    ['uG4HYp~Z--', 144.9631, -37.8136, 15],
    ['TZHvSR7--', -122.4194, 37.7749, 12],
    ['uN~ROOdVC--', 151.2093, -33.8688, 18],
  ])('%s is %f, %f at zoom %i', (code, lng, lat, zoom) => {
    const view = decodeShortlink(code)!
    expect(view.zoom).toBe(zoom)
    expect(view.center.lng).toBeCloseTo(lng, 2)
    expect(view.center.lat).toBeCloseTo(lat, 2)
  })

  it('reads the old "@" for "~"', () => {
    expect(decodeShortlink('uG4HYp@Z--')).toEqual(decodeShortlink('uG4HYp~Z--'))
  })

  it('places nothing from a code too short to', () => {
    expect(decodeShortlink('AA')).toBeNull()
  })
})

describe('shareLink', () => {
  const at = { lng: 144.96706, lat: -37.81827 }
  const link = (zoom: number) => shareLink(at, zoom, 'https://maps.example')

  it('is a marked shortlink on this address', () => {
    expect(link(16)).toBe('https://maps.example/go/uG4HPHpJ?m')
  })

  it('zooms in far enough to pin down the spot, and no further than a code holds', () => {
    expect(link(4.3)).toBe(link(16))
    expect(link(17.6)).toBe(link(18))
    expect(link(24)).toBe(link(22))
  })
})

describe('parseLink', () => {
  it('reads a shortlink, and whether it marks the spot', () => {
    const view = decodeShortlink('uG4HPHpJ')!
    expect(parseLink(url('/go/uG4HPHpJ?m'))).toEqual({ ...view, marker: view.center })
    expect(parseLink(url('/go/uG4HPHpJ'))).toEqual({ ...view, marker: null })
    expect(parseLink(url('/go/~v2juONc--'))).toMatchObject({ zoom: 15, marker: null })
  })

  it("ignores what isn't a shortlink, or is too short to place", () => {
    expect(parseLink(url('/go/'))).toBeNull()
    expect(parseLink(url('/go/a/b'))).toBeNull()
    expect(parseLink(url('/go/AAAAAAAAAAA'))).toBeNull()
    expect(parseLink(url('/go/AA?m'))).toBeNull()
  })

  it("reads OSM's view, with a marker", () => {
    expect(parseLink(url('/?mlat=-37.81827&mlon=144.96706#map=15/-37.8136/144.9631'))).toEqual({
      center: { lat: -37.8136, lng: 144.9631 },
      zoom: 15,
      marker: { lat: -37.81827, lng: 144.96706 },
    })
  })

  it('reads a view alone, as OSM or as plain parameters', () => {
    const view = { center: { lat: -37.8136, lng: 144.9631 }, zoom: 15, marker: null }
    expect(parseLink(url('/#map=15/-37.8136/144.9631'))).toEqual(view)
    expect(parseLink(url('/?lat=-37.8136&lon=144.9631&zoom=15'))).toEqual(view)
  })

  it('centres a marker alone, zoomed in on it', () => {
    expect(parseLink(url('/?mlat=-37.81827&mlon=144.96706'))).toEqual({
      center: { lat: -37.81827, lng: 144.96706 },
      zoom: 16,
      marker: { lat: -37.81827, lng: 144.96706 },
    })
  })

  it('leaves out what makes no sense', () => {
    expect(parseLink(url('/'))).toBeNull()
    expect(parseLink(url('/?simulate'))).toBeNull()
    expect(parseLink(url('/?lat=95&lon=144.9631&zoom=15'))).toBeNull()
    expect(parseLink(url('/?lat=&lon=144.9631'))).toBeNull()
    expect(parseLink(url('/#map=15/north/144.9631'))).toBeNull()
    // Not numbers, though they start like them
    expect(parseLink(url('/?lat=-37.8abc&lon=144.9xyz&zoom=15'))).toBeNull()
    expect(parseLink(url('/#map=15/-37.8136junk/144.9631'))).toBeNull()
    expect(parseLink(url('/?lat=-37.8136&lon=144.9631&zoom=15x'))).toMatchObject({ zoom: 16 })
    // A zoom out of range falls back to one for a spot
    expect(parseLink(url('/?lat=-37.8136&lon=144.9631&zoom=40'))).toMatchObject({ zoom: 16 })
  })
})
