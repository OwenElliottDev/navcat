import { describe, expect, it } from 'vitest'
import { sortTransitModes, transitModeLabel } from './transitModes'

describe('transit modes', () => {
  it('labels modes in plain words', () => {
    expect(transitModeLabel('RAIL')).toBe('Train')
    expect(transitModeLabel('CABLE_CAR')).toBe('Cable car')
  })

  it('sorts known modes first, in order, without changing the input', () => {
    const modes = ['FERRY', 'GONDOLA', 'BUS', 'RAIL', 'TRAM']
    expect(sortTransitModes(modes)).toEqual(['RAIL', 'TRAM', 'BUS', 'FERRY', 'GONDOLA'])
    expect(modes[0]).toBe('FERRY')
  })
})
