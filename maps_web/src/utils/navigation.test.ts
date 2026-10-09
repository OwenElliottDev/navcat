import { describe, expect, it } from 'vitest'
import type { RoutePath } from '../types'
import { bearingBetween, guide, locate, pointAlong, prepareRoute } from './navigation'

// An L-shaped route in Melbourne: ~111 m east along each of points 0-2, then north to 3-4.
// 0.001° of longitude at this latitude is ~88 m; 0.001° of latitude ~111 m.
const LAT = -37.8
const path: RoutePath = {
  distance: 0,
  time: 100_000,
  bbox: [0, 0, 0, 0],
  points: {
    type: 'LineString',
    coordinates: [
      [145.0, LAT],
      [145.001, LAT],
      [145.002, LAT],
      [145.002, LAT + 0.001],
      [145.002, LAT + 0.002],
    ],
  },
  instructions: [
    { text: 'Head east', sign: 0, distance: 176, time: 60_000, interval: [0, 2] },
    { text: 'Turn left', sign: -2, distance: 222, time: 40_000, interval: [2, 4] },
    { text: 'Arrive', sign: 4, distance: 0, time: 0, interval: [4, 4] },
  ],
}
const route = prepareRoute(path)

describe('prepareRoute', () => {
  it('measures each point along the route', () => {
    expect(route.along).toHaveLength(5)
    expect(route.along[0]).toBe(0)
    expect(route.along[2]).toBeCloseTo(176, -1)
    expect(route.length).toBeCloseTo(176 + 222, -1)
  })
})

describe('bearingBetween', () => {
  it('measures clockwise from north', () => {
    const at = { lng: 145, lat: LAT }
    expect(bearingBetween(at, { lng: 145, lat: LAT + 1 })).toBeCloseTo(0)
    expect(bearingBetween(at, { lng: 146, lat: LAT })).toBeCloseTo(90, 0)
    expect(bearingBetween(at, { lng: 145, lat: LAT - 1 })).toBeCloseTo(180)
    expect(bearingBetween(at, { lng: 144, lat: LAT })).toBeCloseTo(270, 0)
  })
})

describe('locate', () => {
  it('snaps a nearby position onto the route', () => {
    // 10 m south of the middle of the first stretch
    const progress = locate(route, { lng: 145.0005, lat: LAT - 0.00009 })
    expect(progress.segment).toBe(0)
    expect(progress.snapped.lat).toBeCloseTo(LAT, 6)
    expect(progress.offRoute).toBeCloseTo(10, 0)
    expect(progress.along).toBeCloseTo(route.along[1] / 2, 0)
    expect(progress.bearing).toBeCloseTo(90, 0)
  })

  it('heads north on the second leg', () => {
    const progress = locate(route, { lng: 145.002, lat: LAT + 0.0015 })
    expect(progress.segment).toBe(3)
    expect(progress.bearing).toBeCloseTo(0, 0)
  })

  // Long routes, ~9 m between points, so the search window (near - 5 to near + 150) matters
  const line = (lngs: number[]) =>
    prepareRoute({
      ...path,
      points: { type: 'LineString', coordinates: lngs.map((lng) => [lng, LAT]) },
      instructions: [{ text: 'Go', sign: 0, distance: 0, time: 0, interval: [0, lngs.length - 1] }],
    })
  const steps = (n: number) => Array.from({ length: n }, (_, i) => 145 + i * 0.0001)

  it('stays on the later pass of a route that doubles back', () => {
    const out = steps(200)
    const outAndBack = line([...out, ...out.toReversed()])
    const at = { lng: out[50], lat: LAT }
    expect(locate(outAndBack, at).segment).toBeLessThan(60)
    expect(locate(outAndBack, at, 345).segment).toBeGreaterThan(340)
  })

  it('searches the whole route when the last fix is far behind', () => {
    const straight = line(steps(400))
    const progress = locate(straight, { lng: 145 + 300 * 0.0001, lat: LAT }, 0)
    expect(progress.offRoute).toBeLessThan(1)
    expect(progress.segment).toBeGreaterThanOrEqual(299)
  })

  it('handles a single-point route', () => {
    const dot = prepareRoute({ ...path, points: { type: 'LineString', coordinates: [[145, LAT]] } })
    expect(dot.length).toBe(0)
    expect(locate(dot, { lng: 145, lat: LAT }).offRoute).toBeCloseTo(0)
  })
})

describe('guide', () => {
  it('points to the next turn with the distance and time left', () => {
    const progress = locate(route, { lng: 145.001, lat: LAT })
    const guidance = guide(route, progress)
    expect(guidance.nextIndex).toBe(1)
    expect(guidance.next?.text).toBe('Turn left')
    expect(guidance.toNext).toBeCloseTo(route.along[2] - route.along[1], 0)
    // Half the first stretch is left, plus all the second
    expect(guidance.remainingTime).toBeCloseTo(30_000 + 40_000, -2)
    expect(guidance.remainingDistance).toBeCloseTo(route.length - route.along[1], 0)
    expect(guidance.arrived).toBe(false)
  })

  it('arrives near the end', () => {
    const guidance = guide(route, locate(route, { lng: 145.002, lat: LAT + 0.00199 }))
    expect(guidance.arrived).toBe(true)
    expect(guidance.remainingTime).toBeLessThan(1000)
  })

  it('has no next manoeuvre on the last instruction', () => {
    const guidance = guide(route, {
      ...locate(route, { lng: 145.002, lat: LAT + 0.002 }),
      segment: 4,
    })
    expect(guidance.next).toBeNull()
    expect(guidance.nextIndex).toBe(-1)
  })
})

describe('pointAlong', () => {
  it('interpolates along the route and clamps to its ends', () => {
    expect(pointAlong(route, -10)).toEqual({ lng: 145, lat: LAT })
    expect(pointAlong(route, 1e6)).toEqual({ lng: 145.002, lat: LAT + 0.002 })
    const mid = pointAlong(route, route.along[1] / 2)
    expect(mid.lng).toBeCloseTo(145.0005, 6)
    expect(mid.lat).toBeCloseTo(LAT, 6)
    const round = locate(route, pointAlong(route, 300))
    expect(round.along).toBeCloseTo(300, 0)
  })
})
