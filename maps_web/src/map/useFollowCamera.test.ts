import { describe, expect, it } from 'vitest'
import { between, type View } from './useFollowCamera'

const view = (bearing: number, center: [number, number] = [144.96, -37.81]): View => ({
  center,
  bearing,
  pitch: 0,
  zoom: 16,
})

describe('between', () => {
  it('moves part of the way', () => {
    const halfway = between(
      { center: [144, -38], bearing: 0, pitch: 0, zoom: 14 },
      { center: [145, -37], bearing: 90, pitch: 50, zoom: 16 },
      0.5,
    )
    expect(halfway).toEqual({ center: [144.5, -37.5], bearing: 45, pitch: 25, zoom: 15 })
  })

  it('turns the short way round through north', () => {
    expect(between(view(350), view(10), 0.5).bearing).toBeCloseTo(360)
    expect(between(view(10), view(350), 0.5).bearing).toBeCloseTo(0)
  })

  it('ends exactly at the new view', () => {
    expect(between(view(350), view(10), 1).bearing % 360).toBeCloseTo(10)
  })
})
