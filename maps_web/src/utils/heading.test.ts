import { describe, expect, it } from 'vitest'
import {
  angleDifference,
  compassFromOrientation,
  facingHeading,
  followsRoute,
  measureMovement,
  smoothAngle,
  STILL,
  type Fix,
} from './heading'

describe('angleDifference', () => {
  it('takes the short way round', () => {
    expect(angleDifference(10, 30)).toBe(20)
    expect(angleDifference(30, 10)).toBe(-20)
    expect(angleDifference(350, 10)).toBe(20)
    expect(angleDifference(10, 350)).toBe(-20)
    expect(Math.abs(angleDifference(0, 180))).toBe(180)
  })
})

describe('smoothAngle', () => {
  it('moves part way, across north', () => {
    expect(smoothAngle(350, 10, 0.5)).toBeCloseTo(0)
    expect(smoothAngle(10, 350, 0.25)).toBeCloseTo(5)
    expect(smoothAngle(90, 180, 1)).toBeCloseTo(180)
  })
})

describe('compassFromOrientation', () => {
  it('uses the top of the screen when lying flat', () => {
    // alpha counts anticlockwise: the top turned 90° anticlockwise of north faces west
    expect(compassFromOrientation(0, 0, 0, 0)).toBeCloseTo(0)
    expect(compassFromOrientation(90, 0, 0, 0)).toBeCloseTo(270)
    // In landscape the top of the screen is the device's side
    expect(compassFromOrientation(0, 0, 0, 90)).toBeCloseTo(90)
  })

  it('uses the back of the phone when held up', () => {
    expect(compassFromOrientation(0, 90, 0, 0)).toBeCloseTo(0)
    expect(compassFromOrientation(90, 90, 0, 0)).toBeCloseTo(270)
    expect(compassFromOrientation(270, 80, 0, 90)).toBeCloseTo(90)
  })
})

describe('facingHeading', () => {
  it('trusts the direction of travel while moving', () => {
    expect(facingHeading(90, 200)).toBe(90)
  })

  it('trusts the compass when still', () => {
    expect(facingHeading(null, 200)).toBe(200)
    expect(facingHeading(null, null)).toBeNull()
  })
})

describe('followsRoute', () => {
  it('locks to the route when facing roughly along it', () => {
    expect(followsRoute(30, 0, false)).toBe(true)
    expect(followsRoute(null, 0, false)).toBe(true)
    expect(followsRoute(170, 0, true)).toBe(false)
    expect(followsRoute(0, null, true)).toBe(false)
  })

  it('needs a bigger turn to unlock than to lock', () => {
    expect(followsRoute(60, 0, true)).toBe(true)
    expect(followsRoute(60, 0, false)).toBe(false)
    expect(followsRoute(-80, 0, true)).toBe(false)
  })
})

describe('measureMovement', () => {
  // ~11 m north of the start for every 0.0001° of latitude
  const fix = (north: number, seconds: number, extra: Partial<Fix> = {}): Fix => ({
    at: { lng: 145, lat: -37.8 + north * 0.0001 },
    accuracy: 5,
    heading: null,
    speed: null,
    time: seconds * 1000,
    ...extra,
  })
  const after = (...fixes: Fix[]) => fixes.reduce(measureMovement, STILL)

  it("uses the device's direction of travel when it gives one", () => {
    expect(after(fix(0, 0, { heading: 200, speed: 5 }))).toMatchObject({ course: 200, speed: 5 })
    expect(after(fix(0, 0, { heading: 200, speed: 1.2 })).course).toBe(200)
    expect(after(fix(0, 0, { heading: 200, speed: 0.4 })).course).toBeNull()
  })

  it('needs to slow down more to stop than to start moving', () => {
    const walking = fix(0, 0, { heading: 200, speed: 1.2 })
    expect(after(walking, fix(0, 1, { heading: 210, speed: 0.4 })).course).toBe(210)
    expect(after(walking, fix(0, 1, { heading: 210, speed: 0.2 })).course).toBeNull()
  })

  it('measures it between fixes once far enough apart', () => {
    expect(after(fix(0, 0), fix(0.5, 1)).course).toBeNull()
    const moving = after(fix(0, 0), fix(0.5, 1), fix(1, 2))
    expect(moving.course).toBeCloseTo(0)
    expect(moving.speed).toBeCloseTo(5.5, 0)
  })

  it('has no direction when barely moving', () => {
    const drifting = after(fix(0, 0), fix(0.2, 9))
    expect(drifting.course).toBeNull()
    expect(drifting.speed).toBeLessThan(1)
  })

  it('skips rough fixes', () => {
    expect(after(fix(0, 0), fix(5, 1, { accuracy: 60 })).course).toBeNull()
  })
})
