import { expect, it } from 'vitest'
import { PinchTwist, twistWeight } from './pinchRotation'

/** Fingers `radius` apart from the centre, turned `degrees` */
function fingers(radius: number, degrees: number) {
  const angle = (degrees * Math.PI) / 180
  return { x: 2 * radius * Math.cos(angle), y: 2 * radius * Math.sin(angle) }
}

/** Moves a pinch from `fromRadius` to `toRadius` while twisting `twist` degrees, over `ms`, in
 * 20 steps, then holds still for `restMs`; returns whether it held the bearing throughout */
function pinch(fromRadius: number, toRadius: number, twist: number, ms: number, restMs = 0) {
  const pinch = new PinchTwist(fingers(fromRadius, 0))
  let held = true
  for (let i = 1; i <= 20; i++) {
    const radius = fromRadius + ((toRadius - fromRadius) * i) / 20
    held &&= pinch.move(fingers(radius, (twist * i) / 20), (ms * i) / 20)
  }
  for (let t = 50; t <= restMs; t += 50) held &&= pinch.move(fingers(toRadius, twist), ms + t)
  return held
}

it('counts all of a twist made while still or zooming slowly, and none while zooming fast', () => {
  expect(twistWeight(0, 0)).toBe(1)
  expect(twistWeight(1, 0)).toBe(1)
  expect(twistWeight(2.5, 0)).toBeCloseTo(0.5)
  expect(twistWeight(10, 0)).toBe(0)
})

it('counts all of a twist made while mostly turning, however fast the zoom', () => {
  // 10 zoom levels a second is each finger moving about 7 radii a second along the circle
  expect(twistWeight(10, 400)).toBe(0)
  expect(twistWeight(10, 2000)).toBe(1)
})

it('rotates once a twist passes the dead-zone', () => {
  expect(pinch(80, 80, 10, 500)).toBe(true)
  expect(pinch(80, 80, 20, 500)).toBe(false)
})

it('holds the bearing through a fast zoom with a sloppy twist, but not a slow one', () => {
  // 1.2 zoom levels in 200 ms, then in 2 s
  expect(pinch(60, 140, 40, 200)).toBe(true)
  expect(pinch(60, 140, 40, 2000)).toBe(false)
})

it('rotates with a quick twist that also changes the gap between the fingers', () => {
  // 90° in 100 ms while the fingers move 30% apart: zooming at 3.8 levels a second
  expect(pinch(80, 104, 90, 100)).toBe(false)
})

it("doesn't start rotating when a fast zoom slows down before the fingers lift", () => {
  expect(pinch(60, 140, 40, 200, 1000)).toBe(true)
})

it("doesn't count twist before the pinch's speed is known", () => {
  // Two moves with the same timestamp: no speed yet, so no weight to apply
  const pinch = new PinchTwist(fingers(60, 0))
  expect(pinch.move(fingers(80, 20), 1000)).toBe(true)
  expect(pinch.move(fingers(100, 40), 1000)).toBe(true)
  // Turning on the spot from then on counts
  for (let i = 1; i <= 10; i++) pinch.move(fingers(100, 40 + 2 * i), 1000 + 50 * i)
  expect(pinch.move(fingers(100, 62), 1550)).toBe(false)
})

it('needs fingers close together to turn further, so jitter does not rotate the map', () => {
  // 30 px apart: 10 px around the circle is 38°
  expect(pinch(15, 15, 30, 500)).toBe(true)
  expect(pinch(15, 15, 50, 500)).toBe(false)
})

it("doesn't rotate when turning the fingers back after a fast zoom's sloppy twist", () => {
  const pinch = new PinchTwist(fingers(60, 0))
  for (let i = 1; i <= 20; i++) pinch.move(fingers(60 + 4 * i, 2 * i), 10 * i)
  // Back 20° slowly: that counts, but the fingers are still 20° the other way from the start
  let held = true
  for (let i = 1; i <= 20; i++) held &&= pinch.move(fingers(140, 40 - i), 200 + 50 * i)
  expect(held).toBe(true)
})
