import { useEffect, useMemo } from 'react'
import { shallow } from 'zustand/shallow'
import { useShallow } from 'zustand/react/shallow'
import { COLORS } from '../config'
import { useBrowse } from '../hooks/useBrowse'
import { useCategories } from '../hooks/useCategories'
import { useProfiles } from '../hooks/useProfiles'
import { useRoute } from '../hooks/useRoute'
import { useTransitModes } from '../hooks/useTransitModes'
import { useTransitPlan } from '../hooks/useTransitPlan'
import { useMoveCount } from '../map/useMoveCount'
import type { RouteSegment, TransitLeg } from '../types'
import { prepareRoute } from '../utils/navigation'
import { itineraryToPath } from '../utils/transitNavigation'
import type { DataSlice } from './data'
import {
  selectIsOnFootOrBike,
  selectIsTransit,
  selectItinerary,
  selectProfile,
  selectRoutePath,
} from './selectors'
import { useAppStore } from '.'

/** Rides in the route's own colour, walks dotted. */
function legSegment(leg: TransitLeg): RouteSegment {
  return leg.isTransit
    ? { geometry: leg.geometry, color: leg.route?.color ?? COLORS.route }
    : { geometry: leg.geometry, color: COLORS.walk, walking: true }
}

/** Copies a value into the store when it changes (fetch states are rebuilt on every render). */
function useKeep<K extends keyof DataSlice>(key: K, value: DataSlice[K]) {
  useEffect(() => {
    if (!shallow(useAppStore.getState()[key], value)) useAppStore.setState({ [key]: value })
  }, [key, value])
}

/** Fetches what the store's choices call for (routes, journeys, browse results) into the store. */
export function useTripData() {
  const routing = useProfiles()
  useKeep('routing', routing)
  useKeep('categories', useCategories())
  useKeep('moveCount', useMoveCount())

  const { waypoints, avoid, avoidSteepHills, tripTime, excludedModes, browse } = useAppStore(
    useShallow((s) => ({
      waypoints: s.waypoints,
      avoid: s.avoid,
      avoidSteepHills: s.avoidSteepHills,
      tripTime: s.tripTime,
      excludedModes: s.excludedModes,
      browse: s.browse,
    })),
  )
  const profile = useAppStore(selectProfile)
  const isTransit = useAppStore(selectIsTransit)
  const isOnFootOrBike = useAppStore(selectIsOnFootOrBike)
  const from = waypoints.from?.position ?? null
  const to = waypoints.to?.position ?? null

  // Walking, cycling and driving come from GraphHopper; public transport from OpenTripPlanner
  useKeep(
    'route',
    useRoute(
      isTransit ? null : from,
      isTransit ? null : to,
      profile,
      profile === 'car'
        ? { avoid: avoid.filter((name) => routing.carAvoids.includes(name)) }
        : isOnFootOrBike && routing.steepHills
          ? { avoidSteepHills }
          : undefined,
    ),
  )
  const transitModes = useTransitModes(isTransit)
  useKeep('transitModes', transitModes)
  useKeep(
    'transitPlan',
    useTransitPlan(isTransit ? from : null, isTransit ? to : null, {
      time: tripTime,
      // Only send a mode list when something's been turned off
      modes: excludedModes.length
        ? transitModes.filter((mode) => !excludedModes.includes(mode))
        : null,
    }),
  )
  useKeep('browseResults', useBrowse(browse))

  const itinerary = useAppStore(selectItinerary)
  const routePath = useAppStore(selectRoutePath)
  useKeep(
    'routeSegments',
    useMemo(() => {
      if (itinerary) return itinerary.legs.map(legSegment)
      if (routePath) return [{ geometry: routePath.points, color: COLORS.route }]
      return []
    }, [itinerary, routePath]),
  )
  // Public transport journeys are followed the same way, as a line with instructions
  useKeep(
    'navRoute',
    useMemo(() => {
      if (isTransit) return itinerary ? prepareRoute(itineraryToPath(itinerary)) : null
      return routePath ? prepareRoute(routePath) : null
    }, [isTransit, itinerary, routePath]),
  )
}
