import type { Travel } from '../hooks/useNavigation'
import { COLORS, CYCLING_STYLES, TRANSIT_PROFILE } from '../config'
import type { Itinerary, Poi, RoutePath, RouteSegment, TransitLeg } from '../types'
import { prepareRoute } from '../utils/navigation'
import { itineraryToPath } from '../utils/transitNavigation'
import type { Store } from '.'

const NO_POIS: Poi[] = []

/** Remembers the last result, so a selector that builds something returns the same one. */
function rememberLast<A extends unknown[], R>(build: (...args: A) => R): (...args: A) => R {
  let last: { args: A; result: R } | null = null
  return (...args) => {
    if (!last || args.some((arg, i) => arg !== last!.args[i])) {
      last = { args, result: build(...args) }
    }
    return last.result
  }
}

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

/** A route or journey is loading, e.g. a new one from where you went off the old */
export const selectIsRouteLoading = (s: Store) =>
  (selectIsTransit(s) ? s.transitPlan.status : s.route.status) === 'loading'

/** The journey option the user picked, or the first one */
export const selectItinerary = (s: Store) => {
  const itineraries = s.transitPlan.status === 'ready' ? s.transitPlan.data : []
  return itineraries.find((option) => option === s.chosenItinerary) ?? itineraries[0] ?? null
}

export const selectRoutePath = (s: Store) => (s.route.status === 'ready' ? s.route.data : null)

/** The browse search shown (browsing is only in search mode) */
export const selectBrowsing = (s: Store) => (s.mode === 'search' ? s.browse : null)

export const selectPois = (s: Store) =>
  selectBrowsing(s) && s.browseResults.status === 'ready' ? s.browseResults.data.results : NO_POIS

/** Rides in the route's own colour, walks dotted. */
function legSegment(leg: TransitLeg): RouteSegment {
  return leg.isTransit
    ? { geometry: leg.geometry, color: leg.route?.color ?? COLORS.route }
    : { geometry: leg.geometry, color: COLORS.walk, walking: true }
}

const routeSegments = rememberLast(
  (itinerary: Itinerary | null, routePath: RoutePath | null): RouteSegment[] => {
    if (itinerary) return itinerary.legs.map(legSegment)
    if (routePath) return [{ geometry: routePath.points, color: COLORS.route }]
    return []
  },
)

/** The route or journey shown, as lines to draw */
export const selectRouteSegments = (s: Store) =>
  routeSegments(selectItinerary(s), selectRoutePath(s))

const navRoute = rememberLast(
  (isTransit: boolean, itinerary: Itinerary | null, routePath: RoutePath | null) => {
    if (isTransit) return itinerary ? prepareRoute(itineraryToPath(itinerary)) : null
    return routePath ? prepareRoute(routePath) : null
  },
)

/** The route or journey shown, ready to follow (public transport too, as a line with steps) */
export const selectNavRoute = (s: Store) =>
  navRoute(selectIsTransit(s), selectItinerary(s), selectRoutePath(s))
