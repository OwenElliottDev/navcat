import type { StateCreator } from 'zustand'
import { getPlace } from '../api/places'
import { findNearbyPlace, reverseGeocode } from '../api/search'
import type { MenuAction } from '../components/ContextMenu'
import type { PlaceDraft } from '../components/PlaceEditor'
import type { BrowseSearch } from '../hooks/useBrowse'
import type { MapPoi } from '../map/useMapInteractions'
import type { Category, End, LngLat, PhotonFeature, PlaceSnapshot, Poi } from '../types'
import { coordLabel } from '../utils/format'
import { placePosition, poiToPlace, pointPlace, toWaypoint } from '../utils/places'
import type { Store } from '.'

export type Mode = 'search' | 'directions'

export interface Menu {
  x: number
  y: number
  position: LngLat
  /** The "What's here?" place showing when it opened, and whether it opened on its dot */
  whatsHere: { place: PhotonFeature; onDot: boolean } | null
}

/** A browse search, and how far the map had moved when it ran (for "Search this area"). */
export interface Browse extends BrowseSearch {
  moveCount: number
}

/** A new place being added at a point on the map */
export interface Adding {
  position: LngLat
  draft: PlaceDraft
}

/** How close to the "What's here?" dot (px) a menu counts as opened on it: room for a finger */
const ON_DOT_PX = 24

/** What's open over the map: a place, browse results, the context menu, the add-place form. */
export interface ViewSlice {
  mode: Mode
  place: PhotonFeature | null
  /** The place "What's here?" last found: while it's the one shown, it's marked with a dot */
  whatsHere: PhotonFeature | null
  browse: Browse | null
  menu: Menu | null
  adding: Adding | null
  /** Why "Your location" or navigation couldn't start, if it couldn't */
  locationProblem: string | null

  setPlace: (place: PhotonFeature | null) => void
  setLocationProblem: (problem: string | null) => void
  /** Opens a place's card, and moves the map to it unless `move` is false. */
  showPlace: (feature: PhotonFeature, move?: boolean) => void
  /** A saved place or recent search, looked up again for its current details. */
  showSnapshot: (snapshot: PlaceSnapshot) => Promise<void>
  showPoi: (poi: MapPoi) => Promise<void>
  showWhatsHere: (position: LngLat, move?: boolean) => Promise<void>
  selectResult: (poi: Poi) => void
  browseCategory: (category: Category) => void
  searchThisArea: () => void
  closeBrowse: () => void
  openMenu: (screen: { x: number; y: number }, position: LngLat) => void
  closeMenu: () => void
  chooseMenuAction: (action: MenuAction) => void
  /** Opens the "Add a place" form, with the address filled in from what's at that spot. */
  startAdding: (position: LngLat) => Promise<void>
  closeAdding: () => void
}

// Bumped by each "What's here?" lookup, so a slow one doesn't replace a newer one
let whatsHereLookup = 0

export const createViewSlice: StateCreator<Store, [], [], ViewSlice> = (set, get) => ({
  mode: 'search',
  place: null,
  whatsHere: null,
  browse: null,
  menu: null,
  adding: null,
  locationProblem: null,

  setPlace: (place) => set({ place }),
  setLocationProblem: (locationProblem) => set({ locationProblem }),

  showPlace(feature, move = true) {
    set({ place: feature })
    if (get().mode !== 'search' || !move) return

    const extent = feature.properties.extent // [minLon, maxLat, maxLon, minLat]
    if (extent) get().camera?.fitBounds([extent[0], extent[3], extent[2], extent[1]])
    else get().camera?.flyTo(placePosition(feature), 16)
  },

  async showSnapshot(snapshot) {
    set({ browse: null })
    const position = { lng: snapshot.lng, lat: snapshot.lat }
    // By id where we can (POIs and places people added), else by name near where it was
    const byId =
      snapshot.osmType && snapshot.osmId
        ? await getPlace({ type: snapshot.osmType, id: snapshot.osmId }).catch(() => null)
        : null
    const found = byId ? poiToPlace(byId) : await findNearbyPlace(snapshot.name, position)
    get().showPlace(found ?? pointPlace(position, snapshot.name))
  },

  async showPoi(poi) {
    // Search knows more about a business (address, hours) than the map tile does
    const found = await findNearbyPlace(poi.name, poi.position)
    get().showPlace(found ?? pointPlace(poi.position, poi.name, poi.kind))
  },

  async showWhatsHere(position, move = true) {
    const lookup = ++whatsHereLookup
    const { place, mode, browse } = get()
    const found = await reverseGeocode(position)
    // Skip if something else opened in the meantime
    const now = get()
    const isStale =
      whatsHereLookup !== lookup ||
      now.place !== place ||
      now.mode !== mode ||
      now.browse !== browse
    if (isStale) return
    const feature: PhotonFeature = found
      ? { ...found, geometry: { coordinates: [position.lng, position.lat] } }
      : pointPlace(position, coordLabel(position))
    set({ whatsHere: feature })
    get().showPlace(feature, move)
  },

  selectResult(poi) {
    set({ place: poiToPlace(poi) })
    get().camera?.flyTo({ lng: poi.lng, lat: poi.lat }, 15)
  },

  browseCategory(category) {
    const { camera, moveCount } = get()
    const area = camera?.visibleArea()
    if (!area) return
    set({ place: null, browse: { category, ...area, moveCount } })
  },

  searchThisArea() {
    const { browse, camera, moveCount } = get()
    const area = camera?.visibleArea()
    if (browse && area) set({ browse: { ...browse, ...area, moveCount } })
  },

  closeBrowse: () => set({ browse: null, place: null }),

  openMenu(screen, position) {
    set({ menu: { ...screen, position, whatsHere: whatsHereAt(get(), screen) } })
  },

  closeMenu: () => set({ menu: null }),

  chooseMenuAction(action) {
    const { menu } = get()
    if (!menu) return
    set({ menu: null })
    if (action === 'what') get().showWhatsHere(menu.position)
    else if (action === 'add') get().startAdding(menu.position)
    else menuDirections(get(), action, menu)
  },

  async startAdding(position) {
    const p = (await reverseGeocode(position))?.properties ?? {}
    const address = {
      'addr:housenumber': p.housenumber,
      'addr:street': p.street,
      'addr:suburb': p.district ?? p.locality ?? p.city,
      'addr:postcode': p.postcode,
    }
    const tags = Object.fromEntries(Object.entries(address).filter(([, value]) => value)) as Record<
      string,
      string
    >
    set({ adding: { position, draft: { name: '', category: '', tags } } })
  },

  closeAdding: () => set({ adding: null }),
})

/**
 * The "What's here?" place, and whether a point on the map (px) is on its dot, as the user sees
 * it now. None if the dot can't be found, as the route's ends might then meet.
 */
function whatsHereAt({ place, whatsHere, camera }: Store, { x, y }: { x: number; y: number }) {
  if (!place || place !== whatsHere) return null
  const dot = camera?.project(placePosition(place))
  if (!dot) return null
  return { place, onDot: Math.hypot(dot.x - x, dot.y - y) < ON_DOT_PX }
}

/**
 * Directions from or to somewhere else go to or from the "What's here?" spot, if that end of
 * the route is still empty. Opened on its dot, they start or end at the place itself.
 */
function menuDirections(store: Store, end: End, { position, whatsHere: opened }: Menu) {
  if (!opened) return store.setWaypointAt(end, position)
  const here = toWaypoint(opened.place)
  if (opened.onDot) store.setWaypoint(end, here)
  else store.setWaypointAt(end, position, here)
}
