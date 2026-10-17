import { expect, it } from 'vitest'
import { holdsBearing } from './pinchRotation'

it('holds the bearing inside the dead-zone, or once a pinch has started zooming', () => {
  expect(holdsBearing(-10, false)).toBe(true)
  expect(holdsBearing(16, false)).toBe(false)
  expect(holdsBearing(90, true)).toBe(true)
})
