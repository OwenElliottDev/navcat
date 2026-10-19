import type { Travel } from '../hooks/useNavigation'
import { CYCLING_STYLES, TRANSIT_PROFILE } from '../config'
import type { Poi } from '../types'
import type { Store } from '.'

const NO_POIS: Poi[] = []

/** The travel mode routes are for: fixed while navigating, so reroutes stay the same kind */
export const selectProfile = (s: Store) =>
  s.navigationProfile ?? s.chosenProfile ?? s.routing.profiles[0]

export const selectIsTransit = (s: Store) => selectProfile(s) === TRANSIT_PROFILE

export const selectIsOnFootOrBike = (s: Store) => {
  const profile = selectProfile(s)
  return profile === 'foot' || profile in CYCLING_STYLES
}

export const selectTravel = (s: Store): Travel => {
  const profile = selectProfile(s)
  if (profile === TRANSIT_PROFILE) return 'transit'
  if (profile === 'foot') return 'walk'
  return profile in CYCLING_STYLES ? 'ride' : 'drive'
}

export const selectIsNavigating = (s: Store) => s.navigationProfile !== null

/** The journey option the user picked, or the first one */
export const selectItinerary = (s: Store) => {
  const itineraries = s.transitPlan.status === 'ready' ? s.transitPlan.data : []
  return itineraries.find((option) => option === s.chosenItinerary) ?? itineraries[0] ?? null
}

export const selectRoutePath = (s: Store) => (s.route.status === 'ready' ? s.route.data : null)

export const selectPois = (s: Store) =>
  s.browseResults.status === 'ready' ? s.browseResults.data.results : NO_POIS
