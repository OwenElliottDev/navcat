import { useEffect, useState } from 'react'
import { getCapabilities, type AvoidOption, type RouteRule } from '../api/capabilities'
import { PROFILE_LABELS, TRANSIT_PROFILE } from '../config'
import { sortTransitModes } from '../utils/transitModes'

// Used until GraphHopper answers (it can take a while to start)
const KNOWN_PROFILES = Object.keys(PROFILE_LABELS)

/** Puts the modes with labels first, in PROFILE_LABELS order; anything else after. */
function rank(name: string): number {
  const index = KNOWN_PROFILES.indexOf(name)
  return index === -1 ? KNOWN_PROFILES.length : index
}

export interface Routing {
  /** Travel modes: GraphHopper's own profiles, plus public transport */
  profiles: string[]
  /** What drives can avoid, given what the routing graph knows about roads */
  carAvoids: AvoidOption[]
  /** Steering walks and rides away from steep hills, when the routing graph has slopes */
  steepHills: { profiles: string[]; priority: RouteRule[] } | null
}

export const KNOWN_ROUTING: Routing = {
  profiles: KNOWN_PROFILES,
  carAvoids: [],
  steepHills: null,
}

/** The route options for a travel mode, as the backend says which modes each is for */
export function routeOptionsFor(routing: Routing, profile: string) {
  return {
    avoid: routing.carAvoids.filter((option) => option.profiles.includes(profile)),
    steepHills: routing.steepHills?.profiles.includes(profile) ? routing.steepHills.priority : null,
  }
}

export interface CapabilitiesState {
  routing: Routing
  /** The transit modes in OTP's timetables, in display order */
  transitModes: string[]
}

/**
 * Travel modes and their options, and the transit modes in the timetables. Fetched again when
 * a travel mode is picked whose part didn't come (GraphHopper or OTP wasn't answering, e.g. still
 * starting, or the backend was down).
 */
export function useCapabilities(profile: string): CapabilitiesState {
  const [state, setState] = useState<CapabilitiesState>({
    routing: KNOWN_ROUTING,
    transitModes: [],
  })
  const missing =
    profile === TRANSIT_PROFILE ? !state.transitModes.length : state.routing === KNOWN_ROUTING

  useEffect(() => {
    if (!missing) return
    getCapabilities().then(
      ({ routing, transit }) => {
        setState((before) => ({
          routing: routing?.profiles.length
            ? {
                profiles: [...routing.profiles, TRANSIT_PROFILE].toSorted(
                  (a, b) => rank(a) - rank(b),
                ),
                carAvoids: routing.avoid,
                steepHills: routing.steepHills,
              }
            : before.routing,
          transitModes: transit ? sortTransitModes(transit.modes) : before.transitModes,
        }))
      },
      () => {
        // Backend down: keep what we have
      },
    )
  }, [profile, missing])

  return state
}
