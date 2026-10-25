import { useEffect } from 'react'
import { shallow } from 'zustand/shallow'
import { useShallow } from 'zustand/react/shallow'
import { useBrowse } from '../hooks/useBrowse'
import { useCategories } from '../hooks/useCategories'
import { useCapabilities } from '../hooks/useCapabilities'
import { useRoute } from '../hooks/useRoute'
import { useTransitPlan } from '../hooks/useTransitPlan'
import { useMap } from '../map/MapContext'
import type { DataSlice } from './data'
import {
  selectIsNavigating,
  selectIsOnFootOrBike,
  selectIsTransit,
  selectProfile,
} from './selectors'
import { useAppStore } from '.'

/** Copies a value into the store when it changes (fetch states are rebuilt on every render). */
function useKeep<K extends keyof DataSlice>(key: K, value: DataSlice[K]) {
  useEffect(() => {
    if (!shallow(useAppStore.getState()[key], value)) useAppStore.setState({ [key]: value })
  }, [key, value])
}

/**
 * Fetches what the store's choices call for (routes, journeys, browse results) into the store.
 * A component of its own, so its re-renders don't re-render the rest of the app.
 */
export function TripData() {
  const isTransit = useAppStore(selectIsTransit)
  const { routing, transitModes } = useCapabilities(isTransit)
  useKeep('routing', routing)
  useKeep('transitModes', transitModes)
  useKeep('categories', useCategories())

  // Counts finished map moves (for "Search this area") without re-rendering anything here.
  // Not while navigating, when the follow camera moves the map many times a second
  const map = useMap()
  useEffect(() => {
    if (!map) return
    const onMoveEnd = () => {
      if (!selectIsNavigating(useAppStore.getState()))
        useAppStore.setState((s) => ({ moveCount: s.moveCount + 1 }))
    }
    map.on('moveend', onMoveEnd)
    return () => {
      map.off('moveend', onMoveEnd)
    }
  }, [map])

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
        ? routing.carAvoids.filter((option) => avoid.includes(option.id)).flatMap((o) => o.priority)
        : isOnFootOrBike && avoidSteepHills
          ? (routing.steepHills ?? [])
          : [],
    ),
  )
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

  return null
}
