import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http } from './http'
import { getRoute, getRoutingInfo } from './routing'

vi.mock('./http', () => ({ http: { post: vi.fn(), get: vi.fn() } }))
const post = vi.mocked(http.post)

const FROM = { lng: 144.96, lat: -37.81 }
const TO = { lng: 144.97, lat: -37.8 }

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue({ data: { paths: [{ distance: 1 }] } })
})

const body = () => post.mock.calls[0][1] as Record<string, unknown>

describe('getRoute', () => {
  it('asks GraphHopper for the route with what navigation needs', async () => {
    expect(await getRoute(FROM, TO, 'foot')).toEqual({ distance: 1 })
    expect(post.mock.calls[0][0]).toBe('/route')
    expect(body()).toMatchObject({
      profile: 'foot',
      points: [
        [144.96, -37.81],
        [144.97, -37.8],
      ],
      points_encoded: false,
      instructions: true,
      details: ['osm_way_id'],
    })
    // The fast (CH) routing stays on without anything to avoid
    expect(body()).not.toHaveProperty('custom_model')
    expect(body()).not.toHaveProperty('ch.disable')
  })

  it('steers away from what to avoid with a custom model', async () => {
    await getRoute(FROM, TO, 'car', { avoid: ['tolls', 'motorways'] })
    expect(body()).toMatchObject({
      'ch.disable': true,
      custom_model: {
        priority: [
          { if: 'toll == ALL', multiply_by: '0.1' },
          { if: 'road_class == MOTORWAY', multiply_by: '0.1' },
        ],
      },
    })
  })

  it('steers a walk or ride away from steep hills', async () => {
    await getRoute(FROM, TO, 'bike', { avoidSteepHills: true })
    expect(body()).toMatchObject({
      custom_model: {
        priority: [
          { if: 'max_slope >= 12 || max_slope <= -12', multiply_by: '0.05' },
          { else_if: 'max_slope >= 8 || max_slope <= -8', multiply_by: '0.2' },
          { else_if: 'max_slope >= 5 || max_slope <= -5', multiply_by: '0.6' },
        ],
      },
    })
  })

  it('leaves the route alone when steep hills are fine', async () => {
    await getRoute(FROM, TO, 'foot', { avoidSteepHills: false })
    expect(body()).not.toHaveProperty('custom_model')
  })
})

describe('getRoutingInfo', () => {
  it('lists profiles and encoded values', async () => {
    vi.mocked(http.get).mockResolvedValueOnce({
      data: {
        profiles: [{ name: 'car' }, { name: 'foot' }],
        encoded_values: { toll: [], road_class: [] },
      },
    })
    expect(await getRoutingInfo()).toEqual({
      profiles: ['car', 'foot'],
      encodedValues: ['toll', 'road_class'],
    })
  })
})
