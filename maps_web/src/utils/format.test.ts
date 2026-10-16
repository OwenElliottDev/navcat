import { describe, expect, it } from 'vitest'
import { coordLabel, formatDistance, formatDuration, humanize } from './format'

describe('formatDistance', () => {
  it('rounds to suit the distance', () => {
    expect(formatDistance(0)).toBe('0 m')
    expect(formatDistance(234)).toBe('230 m')
    expect(formatDistance(999)).toBe('1000 m')
    expect(formatDistance(1000)).toBe('1.0 km')
    expect(formatDistance(12_345)).toBe('12.3 km')
    expect(formatDistance(123_456)).toBe('123 km')
  })
})

describe('formatDuration', () => {
  it('shows minutes, then hours and minutes', () => {
    expect(formatDuration(10_000)).toBe('1 min')
    expect(formatDuration(25 * 60_000)).toBe('25 min')
    expect(formatDuration(60 * 60_000)).toBe('1 h 0 min')
    expect(formatDuration(135 * 60_000)).toBe('2 h 15 min')
  })
})

describe('humanize', () => {
  it('turns tag values into words', () => {
    expect(humanize('fast_food')).toBe('Fast food')
    expect(humanize('charging_station')).toBe('Charging station')
    expect(humanize(undefined)).toBe('')
  })
})

describe('coordLabel', () => {
  it('reads latitude first', () => {
    expect(coordLabel({ lng: 144.9631, lat: -37.8136 })).toBe('-37.81360, 144.96310')
  })
})
