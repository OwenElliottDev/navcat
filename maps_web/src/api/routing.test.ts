import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http } from './http'
import { getRoute } from './routing'

vi.mock('./http', () => ({ http: { post: vi.fn() } }))
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

  it('steers the route with the rules as a custom model', async () => {
    const rules = [
      { if: 'toll == ALL', multiply_by: '0.1' },
      { if: 'road_class == MOTORWAY', multiply_by: '0.1' },
    ]
    await getRoute(FROM, TO, 'car', rules)
    expect(body()).toMatchObject({ 'ch.disable': true, custom_model: { priority: rules } })
  })

  it('leaves the route alone without rules', async () => {
    await getRoute(FROM, TO, 'foot', [])
    expect(body()).not.toHaveProperty('custom_model')
  })
})
