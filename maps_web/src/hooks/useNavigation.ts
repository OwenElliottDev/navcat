import { useEffect, useRef, useState } from 'react'
import type { LngLat } from '../types'
import { SIGN_ALIGHT } from '../utils/transitNavigation'
import {
  guide,
  locate,
  pointAlong,
  type Guidance,
  type NavRoute,
  type RouteProgress,
} from '../utils/navigation'

export type Travel = 'walk' | 'ride' | 'drive' | 'transit'

export interface Fix {
  at: LngLat
  /** Metres */
  accuracy: number
  /** Degrees from north, when the device knows */
  heading: number | null
}

export interface NavigationState {
  fix: Fix | null
  progress: RouteProgress | null
  guidance: Guidance | null
  error: string | null
}

interface Options {
  /** The route being followed; null while a new one is being worked out */
  route: NavRoute | null
  active: boolean
  travel: Travel
  /** Pretend to travel the route instead of using GPS */
  simulate: boolean
  speak: (text: string) => void
  /** Asked for a new route from here, after straying off this one */
  onOffRoute: (at: LngLat) => void
}

// How far ahead to announce a turn, by how fast people travel (metres). On public transport,
// the turns are on foot, but getting off is announced well before the stop.
const ANNOUNCE_AT: Record<Travel, number[]> = {
  walk: [120, 25],
  ride: [200, 40],
  drive: [800, 300, 60],
  transit: [120, 25],
}
const ANNOUNCE_STOP_AT = [1000, 300]
// Further than this from the route, for a few fixes in a row, means a wrong turn
const OFF_ROUTE_METRES: Record<Travel, number> = { walk: 35, ride: 45, drive: 60, transit: 80 }
const OFF_ROUTE_FIXES = 3
const REROUTE_COOLDOWN_MS = 15_000
// Simulated trips run at this many times normal speed (m/s)
const SIMULATED_SPEED: Record<Travel, number> = {
  walk: 1.4 * 4,
  ride: 5 * 4,
  drive: 13 * 3,
  transit: 8 * 4,
}

function spokenDistance(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} kilometres`
  return `${Math.max(50, Math.round(metres / 50) * 50)} metres`
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/** Follows a route from GPS fixes: where you are, what's next, and when to say it. */
export function useNavigation(options: Options): NavigationState {
  const [state, setState] = useState<NavigationState>({
    fix: null,
    progress: null,
    guidance: null,
    error: null,
  })

  // The latest options, for use inside GPS callbacks without restarting them
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })

  // Per-route memory: where we last were, what's been said, how long we've been off it
  const segment = useRef<number | undefined>(undefined)
  const announced = useRef(new Set<string>())
  const offCount = useRef(0)
  const lastReroute = useRef(0)
  const lastRoute = useRef<NavRoute | null>(null)

  useEffect(() => {
    if (!options.route) return // keep the old route while a new one loads
    lastRoute.current = options.route
    segment.current = undefined
    offCount.current = 0
  }, [options.route])

  useEffect(() => {
    if (!options.active) return
    announced.current = new Set()
    lastReroute.current = 0

    function update(fix: Fix) {
      const { route, travel, speak, onOffRoute } = latest.current
      const followed = route ?? lastRoute.current
      if (!followed) return

      const progress = locate(followed, fix.at, segment.current)
      segment.current = progress.segment
      const guidance = guide(followed, progress)

      // Off the route? Only trust reasonably accurate fixes, and wait for a few in a row
      const isOff = progress.offRoute > OFF_ROUTE_METRES[travel] && fix.accuracy < 50
      offCount.current = isOff ? offCount.current + 1 : 0
      const now = Date.now()
      if (
        route &&
        offCount.current >= OFF_ROUTE_FIXES &&
        now - lastReroute.current > REROUTE_COOLDOWN_MS
      ) {
        lastReroute.current = now
        offCount.current = 0
        onOffRoute(fix.at)
      }

      // Say the next instruction as it gets close (just the nearest threshold passed)
      if (guidance.arrived) {
        if (!announced.current.has('arrived')) {
          announced.current.add('arrived')
          speak('You have arrived')
        }
      } else if (guidance.next && route) {
        const thresholds =
          guidance.next.sign === SIGN_ALIGHT ? ANNOUNCE_STOP_AT : ANNOUNCE_AT[travel]
        const due = thresholds.filter((at) => guidance.toNext <= at)
        const nearest = due[due.length - 1]
        const key = `${guidance.nextIndex}@${nearest}`
        if (nearest !== undefined && !announced.current.has(key)) {
          thresholds
            .filter((at) => at >= nearest)
            .forEach((at) => announced.current.add(`${guidance.nextIndex}@${at}`))
          const isLast = nearest === thresholds.at(-1)
          speak(
            isLast
              ? guidance.next.text
              : `In ${spokenDistance(guidance.toNext)}, ${lowerFirst(guidance.next.text)}`,
          )
        }
      }

      setState({ fix, progress, guidance, error: null })
    }

    if (options.simulate) {
      let travelled = 0
      const timer = setInterval(() => {
        const route = latest.current.route ?? lastRoute.current
        if (!route) return
        travelled = Math.min(route.length, travelled + SIMULATED_SPEED[latest.current.travel])
        update({ at: pointAlong(route, travelled), accuracy: 5, heading: null })
      }, 1000)
      return () => clearInterval(timer)
    }

    if (!('geolocation' in navigator)) return
    const watch = navigator.geolocation.watchPosition(
      (position) =>
        update({
          at: { lng: position.coords.longitude, lat: position.coords.latitude },
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
        }),
      (err) =>
        setState((s) => ({
          ...s,
          error:
            err.code === err.PERMISSION_DENIED
              ? 'Location is turned off for this site. Allow it in your browser settings.'
              : 'Looking for your location…',
        })),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20_000 },
    )
    return () => navigator.geolocation.clearWatch(watch)
  }, [options.active, options.simulate])

  const unsupported = options.active && !options.simulate && !('geolocation' in navigator)
  return unsupported ? { ...state, error: 'This browser can’t share your location.' } : state
}
