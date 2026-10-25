import { useEffect, useRef, useState } from 'react'
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

export interface Profiles {
  /** Travel modes: GraphHopper's own profiles, plus public transport */
  profiles: string[]
  /** What drives can avoid, given what the routing graph knows about roads */
  carAvoids: AvoidOption[]
  /** Rules steering walks and rides away from steep hills, when the routing graph has slopes */
  steepHills: RouteRule[] | null
}

export const KNOWN_ROUTING: Profiles = {
  profiles: KNOWN_PROFILES,
  carAvoids: [],
  steepHills: null,
}

export interface CapabilitiesState {
  routing: Profiles
  /** The transit modes in OTP's timetables, in display order */
  transitModes: string[]
}

/**
 * Travel modes and their options, and the transit modes in the timetables. Fetched again when
 * transit is `active` if OTP wasn't answering before (e.g. still starting).
 */
export function useCapabilities(transitActive: boolean): CapabilitiesState {
  const [state, setState] = useState<CapabilitiesState>({
    routing: KNOWN_ROUTING,
    transitModes: [],
  })
  const fetched = useRef(false)
  const wantsTransit = transitActive && !state.transitModes.length

  useEffect(() => {
    // Once at the start, then again only for transit modes OTP didn't have ready
    if (fetched.current && !wantsTransit) return
    fetched.current = true
    getCapabilities().then(
      ({ routing, transit }) => {
        setState((before) => ({
          routing: routing?.profiles.length
            ? {
                profiles: [...routing.profiles, TRANSIT_PROFILE].toSorted(
                  (a, b) => rank(a) - rank(b),
                ),
                carAvoids: routing.avoid,
                steepHills: routing.steepHills?.priority ?? null,
              }
            : before.routing,
          transitModes: transit ? sortTransitModes(transit.modes) : before.transitModes,
        }))
      },
      () => {
        // Backend down: keep what we have
      },
    )
  }, [wantsTransit])

  return state
}
