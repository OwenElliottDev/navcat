import { describe, expect, it } from 'vitest'
import type { RoutePath } from '../types'
import { approaches, parseLanes } from './lanes'

const active = (value: string, sign: number) =>
  parseLanes(value, sign)?.map((lane) => lane.active) ?? null

describe('parseLanes', () => {
  it('marks the lanes for the turn', () => {
    expect(parseLanes('left|through|through;right', 2)).toEqual([
      { directions: ['left'], active: false },
      { directions: ['through'], active: false },
      { directions: ['through', 'right'], active: true },
    ])
    expect(active('left|through|through;right', 0)).toEqual([false, true, true])
  })

  it('treats unmarked lanes as going straight on', () => {
    expect(parseLanes('left||', 0)).toEqual([
      { directions: ['left'], active: false },
      { directions: ['none'], active: true },
      { directions: ['none'], active: true },
    ])
  })

  it('falls back to a nearby direction', () => {
    expect(active('slight_left|through', -2)).toEqual([true, false])
    expect(active('left|through', -1)).toEqual([true, false])
  })

  it('keeps to the matching half of through lanes at a fork', () => {
    expect(active('through|through|through|through', -7)).toEqual([true, true, false, false])
    expect(active('through|through|through', 7)).toEqual([false, true, true])
    // A marked lane for the fork beats the through lanes
    expect(active('through|through|slight_right', 7)).toEqual([false, false, true])
  })

  it('shows nothing for one lane, or none that fit', () => {
    expect(parseLanes('left', -2)).toBeNull()
    expect(parseLanes('left|left', 2)).toBeNull()
    expect(parseLanes('left|through', 6)).toBeNull() // roundabout
  })
})

describe('approaches', () => {
  const path: RoutePath = {
    distance: 0,
    time: 0,
    bbox: [0, 0, 0, 0],
    points: {
      type: 'LineString',
      coordinates: [
        [145.0, -37.8],
        [145.001, -37.8],
        [145.002, -37.8],
        [145.002, -37.799],
        [145.002, -37.798],
      ],
    },
    instructions: [
      { text: 'Head east', sign: 0, distance: 0, time: 0, interval: [0, 2] },
      { text: 'Turn left', sign: -2, distance: 0, time: 0, interval: [2, 3] },
      { text: 'Roundabout', sign: 6, distance: 0, time: 0, interval: [3, 4] },
      { text: 'Arrive', sign: 4, distance: 0, time: 0, interval: [4, 4] },
    ],
    details: {
      osm_way_id: [
        [0, 2, 111],
        [2, 4, 222],
      ],
    },
  }

  it('takes the stretch of road just before each turn', () => {
    expect(approaches(path)).toEqual([
      null, // the start
      { wayId: 111, start: [145.001, -37.8], end: [145.002, -37.8] },
      null, // roundabouts have no lanes to show
      null, // nor does arriving
    ])
  })

  it('needs the way ids', () => {
    expect(approaches({ ...path, details: undefined }).every((a) => a === null)).toBe(true)
  })
})
