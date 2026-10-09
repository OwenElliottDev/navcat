import { describe, expect, it } from 'vitest'
import type { Itinerary, TransitLeg, TransitStep } from '../types'
import { itineraryToPath, SIGN_ALIGHT, SIGN_BOARD } from './transitNavigation'

const step = (relativeDirection: string, streetName: string | null, lng: number): TransitStep => ({
  relativeDirection,
  absoluteDirection: relativeDirection === 'DEPART' ? 'NORTHEAST' : null,
  streetName,
  distance: 100,
  at: { lng, lat: -37.8 },
  exit: null,
})

const line = (...lngs: number[]) => ({
  type: 'LineString' as const,
  coordinates: lngs.map((lng): [number, number] => [lng, -37.8]),
})

// Walk 200 m (8:00-8:03), wait 2 min, tram 8:05-8:15, walk 100 m to 8:17
const walkToStop: TransitLeg = {
  mode: 'WALK',
  isTransit: false,
  start: '2026-10-05T08:00:00+11:00',
  end: '2026-10-05T08:03:00+11:00',
  duration: 180,
  distance: 200,
  from: 'Origin',
  to: 'Stop A',
  geometry: line(145.0, 145.001, 145.002),
  steps: [step('DEPART', 'Swanston Street', 145.0), step('LEFT', 'Stop A', 145.002)],
}
const tram: TransitLeg = {
  mode: 'TRAM',
  isTransit: true,
  start: '2026-10-05T08:05:00+11:00',
  end: '2026-10-05T08:15:00+11:00',
  duration: 600,
  distance: 3000,
  from: 'Stop A',
  to: 'Lygon St',
  headsign: 'Bundoora',
  route: { name: '86' },
  geometry: line(145.002, 145.01, 145.02, 145.03),
  steps: [],
}
const walkFromStop: TransitLeg = {
  ...walkToStop,
  start: '2026-10-05T08:15:00+11:00',
  end: '2026-10-05T08:17:00+11:00',
  duration: 120,
  distance: 100,
  from: 'Lygon St',
  to: 'Destination',
  geometry: line(145.03, 145.031),
  steps: [],
}
const itinerary: Itinerary = {
  start: walkToStop.start,
  end: walkFromStop.end,
  duration: 17 * 60,
  legs: [walkToStop, tram, walkFromStop],
}

describe('itineraryToPath', () => {
  const path = itineraryToPath(itinerary)
  const texts = path.instructions.map((instruction) => instruction.text)

  it('joins the legs into one line', () => {
    expect(path.points.coordinates).toHaveLength(3 + 4 + 2)
    expect(path.distance).toBe(3300)
    expect(path.time).toBe(17 * 60 * 1000)
  })

  it('says how to walk, board, get off and arrive', () => {
    expect(texts).toEqual([
      'Walk northeast on Swanston Street',
      // The walk's last turn is named after the stop, so it's said as going to the stop
      'Turn left to the stop',
      'Board the 86 tram towards Bundoora at Stop A',
      'Get off at Lygon St',
      // A walk OTP gave no steps for
      'Walk',
      'Arrive at your destination',
    ])
    expect(path.instructions[2].sign).toBe(SIGN_BOARD)
    expect(path.instructions[3].sign).toBe(SIGN_ALIGHT)
  })

  it('places each instruction where it happens', () => {
    const starts = path.instructions.map((instruction) => instruction.interval[0])
    // Turn at the walk's last point; board at the tram's first; get off one point before its end
    expect(starts).toEqual([0, 2, 3, 5, 7, 8])
  })

  it('covers the line with contiguous intervals', () => {
    path.instructions.forEach((instruction, i) => {
      const next = path.instructions[i + 1]
      expect(instruction.interval[1]).toBe(
        next ? next.interval[0] : path.points.coordinates.length - 1,
      )
    })
  })

  it('counts waits towards the next leg, so times add up to the journey', () => {
    const times = path.instructions.map((instruction) => instruction.time)
    expect(times[2]).toBe((2 + 10) * 60_000)
    expect(times.reduce((sum, time) => sum + time, 0)).toBe(path.time)
  })

  it('names rides without a route by the vehicle', () => {
    const bus = { ...tram, mode: 'BUS', route: undefined, headsign: undefined }
    const texts = itineraryToPath({ ...itinerary, legs: [bus] }).instructions.map((i) => i.text)
    expect(texts[0]).toBe('Board the bus at Stop A')
  })

  it('reads roundabouts and unknown turns', () => {
    const walk = {
      ...walkToStop,
      steps: [
        step('DEPART', null, 145.0),
        { ...step('CIRCLE_CLOCKWISE', 'High St', 145.001), exit: '2' },
        step('SOMETHING_NEW', 'Low St', 145.002),
      ],
    }
    const texts = itineraryToPath({ ...itinerary, legs: [walk] }).instructions.map((i) => i.text)
    expect(texts).toEqual([
      'Walk northeast',
      'At the roundabout, take exit 2',
      'Continue onto Low St',
      'Arrive at your destination',
    ])
  })
})
