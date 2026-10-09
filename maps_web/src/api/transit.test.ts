import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http } from './http'
import { getTransitModes, planTransit, TransitPlanError } from './transit'

vi.mock('./http', () => ({ http: { post: vi.fn() } }))
const post = vi.mocked(http.post)
const answer = (data: unknown) => post.mockResolvedValueOnce({ data })

const FROM = { lng: 144.96, lat: -37.81 }
const TO = { lng: 144.97, lat: -37.8 }

const otpLeg = {
  mode: 'TRAM',
  transitLeg: true,
  headsign: 'Bundoora',
  distance: 3000,
  duration: 600,
  start: {
    scheduledTime: '2026-10-05T08:05:00+11:00',
    estimated: { time: '2026-10-05T08:07:00+11:00' },
  },
  end: { scheduledTime: '2026-10-05T08:15:00+11:00', estimated: null },
  from: { name: 'Stop A' },
  to: { name: null },
  route: { shortName: null, longName: 'Route 86', color: '00FF00', textColor: null },
  legGeometry: { points: '_p~iF~ps|U_ulLnnqC' },
  steps: [
    {
      distance: 50,
      relativeDirection: 'LEFT',
      absoluteDirection: 'NORTH',
      streetName: 'path',
      bogusName: true,
      lat: -37.8,
      lon: 145,
      exit: null,
    },
  ],
}

beforeEach(() => post.mockReset())

describe('planTransit', () => {
  it('maps OTP itineraries to journeys', async () => {
    answer({
      data: {
        planConnection: {
          routingErrors: [],
          edges: [{ node: { start: 's', end: 'e', duration: 900, legs: [otpLeg] } }],
        },
      },
    })
    const [journey] = await planTransit(FROM, TO, { time: null, modes: null })
    expect(journey).toMatchObject({ start: 's', end: 'e', duration: 900 })
    expect(journey.legs[0]).toEqual({
      mode: 'TRAM',
      isTransit: true,
      // Live times beat the timetable
      start: '2026-10-05T08:07:00+11:00',
      end: '2026-10-05T08:15:00+11:00',
      duration: 600,
      distance: 3000,
      from: 'Stop A',
      to: '',
      headsign: 'Bundoora',
      route: { name: 'Route 86', color: '#00FF00', textColor: undefined },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-120.2, 38.5],
          [-120.95, 40.7],
        ],
      },
      // A made-up name ("path") isn't shown
      steps: [
        {
          relativeDirection: 'LEFT',
          absoluteDirection: 'NORTH',
          streetName: null,
          distance: 50,
          at: { lng: 145, lat: -37.8 },
          exit: null,
        },
      ],
    })
  })

  it('sends the time and modes only when set', async () => {
    const noJourney = { data: { planConnection: { routingErrors: [], edges: [] } } }
    answer(noJourney)
    await planTransit(FROM, TO, { time: null, modes: null }).catch(() => {})
    expect(post.mock.calls[0][1]).toMatchObject({
      variables: {
        from: { latitude: -37.81, longitude: 144.96 },
        to: { latitude: -37.8, longitude: 144.97 },
      },
    })
    expect((post.mock.calls[0][1] as { variables: object }).variables).not.toHaveProperty(
      'dateTime',
    )
    expect((post.mock.calls[0][1] as { variables: object }).variables).not.toHaveProperty('modes')

    answer(noJourney)
    const time = { type: 'arriveBy' as const, time: '2026-10-05T09:00' }
    await planTransit(FROM, TO, { time, modes: ['TRAM'] }).catch(() => {})
    expect(post.mock.calls[1][1]).toMatchObject({
      variables: {
        dateTime: { latestArrival: new Date(2026, 9, 5, 9).toISOString() },
        modes: { transit: { transit: [{ mode: 'TRAM' }] } },
      },
    })
  })

  it("says why there's no journey", async () => {
    answer({
      data: { planConnection: { routingErrors: [{ code: 'OUTSIDE_SERVICE_PERIOD' }], edges: [] } },
    })
    const err = await planTransit(FROM, TO, { time: null, modes: null }).catch((e) => e)
    expect(err).toBeInstanceOf(TransitPlanError)
    expect(err.code).toBe('OUTSIDE_SERVICE_PERIOD')

    answer({ errors: [{ message: 'Bad query' }] })
    await expect(planTransit(FROM, TO, { time: null, modes: null })).rejects.toThrow('Bad query')
  })
})

describe('getTransitModes', () => {
  it('lists each mode once', async () => {
    answer({ data: { routes: [{ mode: 'BUS' }, { mode: 'TRAM' }, { mode: 'BUS' }] } })
    expect(await getTransitModes()).toEqual(['BUS', 'TRAM'])
  })
})
