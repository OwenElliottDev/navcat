import { angleDifference } from '../utils/heading'

/*
 * Glides to each new GPS fix in steps, for the follow camera and the "you are here" marker.
 * MapLibre's own animations (easeTo) redraw the map on every display frame, 60-120 times a
 * second; stepping a fixed number of times a second is smooth enough and far easier on
 * phone batteries. All glides step on one timer, so the map and the marker move together.
 */

/** Steps per second */
export const GLIDE_FPS = 24
/** How long a glide takes (fixes come about once a second) */
export const GLIDE_MS = 900

export const along = (from: number, to: number, t: number) => from + (to - from) * t

/** The bearing `t` (0 to 1) of the way from one to another, turning the short way round. */
export function turn(from: number, to: number, t: number) {
  return from + angleDifference(from, to) * t
}

type Tick = () => boolean
const glides = new Set<Tick>()
let timer: ReturnType<typeof setInterval> | undefined

/**
 * Calls `step` with how far along the glide is (0 to 1), now and then GLIDE_FPS times a
 * second until it gets to 1. Returns a function that stops it.
 */
export function glide(step: (t: number) => void): () => void {
  const start = performance.now()
  const tick: Tick = () => {
    const t = Math.min(1, (performance.now() - start) / GLIDE_MS)
    step(t)
    return t < 1
  }
  if (!tick()) return () => {}

  glides.add(tick)
  timer ??= setInterval(() => {
    for (const next of glides) if (!next()) glides.delete(next)
    if (glides.size === 0) {
      clearInterval(timer)
      timer = undefined
    }
  }, 1000 / GLIDE_FPS)
  return () => {
    glides.delete(tick)
  }
}
