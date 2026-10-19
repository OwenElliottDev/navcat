import type { StateCreator } from 'zustand'
import { reverseGeocode } from '../api/search'
import type { CarAvoid } from '../config'
import type { End, Itinerary, LngLat, TripTime, Waypoint } from '../types'
import { coordLabel } from '../utils/format'
import { currentPosition, isLocationAllowed } from '../utils/location'
import { describePlace, toWaypoint } from '../utils/places'
import type { Store } from '.'

const NO_WAYPOINTS = { from: null, to: null }

/** The route asked for: its ends and the options for each way of getting there. */
export interface DirectionsSlice {
  waypoints: Record<End, Waypoint | null>
  chosenProfile: string | null
  avoid: CarAvoid[]
  avoidSteepHills: boolean
  tripTime: TripTime | null
  excludedModes: string[]
  chosenItinerary: Itinerary | null
  /** The point on the route under the elevation chart's cursor */
  elevationAt: LngLat | null

  /** Sets a route end, and the other one to `fill` if that's still empty. */
  setWaypoint: (end: End, waypoint: Waypoint, fill?: Waypoint) => void
  /** Sets a route end from a bare point, then names it once search finds what's there. */
  setWaypointAt: (end: End, position: LngLat, fill?: Waypoint) => Promise<void>
  /** Sets a route end to wherever the device is now. */
  setWaypointToHere: (end: End) => Promise<void>
  /** Off the route while navigating: a new one from here, to the same destination */
  rerouteFrom: (at: LngLat) => void
  openDirections: () => Promise<void>
  closeDirections: () => void
  swapEnds: () => void
  setChosenProfile: (profile: string) => void
  setAvoid: (avoid: CarAvoid[]) => void
  setAvoidSteepHills: (avoidSteepHills: boolean) => void
  setTripTime: (tripTime: TripTime | null) => void
  setExcludedModes: (excludedModes: string[]) => void
  chooseItinerary: (itinerary: Itinerary) => void
  setElevationAt: (elevationAt: LngLat | null) => void
}

export const createDirectionsSlice: StateCreator<Store, [], [], DirectionsSlice> = (set, get) => ({
  waypoints: NO_WAYPOINTS,
  chosenProfile: null,
  avoid: [],
  avoidSteepHills: false,
  tripTime: null,
  excludedModes: [],
  chosenItinerary: null,
  elevationAt: null,

  setWaypoint(end, waypoint, fill) {
    const otherName = end === 'from' ? 'to' : 'from'
    const { waypoints } = get()
    const otherEnd = waypoints[otherName] ?? fill
    set({
      waypoints: { ...waypoints, [otherName]: otherEnd ?? null, [end]: waypoint },
      place: null,
      mode: 'directions',
    })
    // With both ends set, the route zooms the map once it loads
    if (!otherEnd) get().camera?.flyTo(waypoint.position, 13)
  },

  async setWaypointAt(end, position, fill) {
    get().setWaypoint(end, { position, label: coordLabel(position) }, fill)

    const found = await reverseGeocode(position)
    if (!found) return
    const label = describePlace(found).name
    // Skip if that end has moved again in the meantime
    const { waypoints } = get()
    if (waypoints[end]?.position === position)
      set({ waypoints: { ...waypoints, [end]: { position, label } } })
  },

  async setWaypointToHere(end) {
    set({ locationProblem: null })
    try {
      get().setWaypoint(end, { position: await currentPosition(), label: 'Your location' })
    } catch (err) {
      set({ locationProblem: (err as Error).message })
    }
  },

  rerouteFrom(at) {
    // Only the start changes; the route reloads with the same profile and destination
    set({ waypoints: { ...get().waypoints, from: { position: at, label: 'Your location' } } })
  },

  async openDirections() {
    const { place } = get()
    if (place) get().setWaypoint('to', toWaypoint(place))
    else set({ mode: 'directions' })
    // Start from here, like other map apps, if that needs no permission prompt
    if (!get().waypoints.from && (await isLocationAllowed())) get().setWaypointToHere('from')
  },

  closeDirections: () => set({ mode: 'search', waypoints: NO_WAYPOINTS, place: null }),

  swapEnds() {
    const { from, to } = get().waypoints
    set({ waypoints: { from: to, to: from } })
  },

  setChosenProfile: (chosenProfile) => set({ chosenProfile }),
  setAvoid: (avoid) => set({ avoid }),
  setAvoidSteepHills: (avoidSteepHills) => set({ avoidSteepHills }),
  setTripTime: (tripTime) => set({ tripTime }),
  setExcludedModes: (excludedModes) => set({ excludedModes }),
  chooseItinerary: (chosenItinerary) => set({ chosenItinerary }),
  setElevationAt: (elevationAt) => set({ elevationAt }),
})
