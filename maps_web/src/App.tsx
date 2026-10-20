import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { useAccount } from './account/AccountContext'
import { getPlace } from './api/places'
import { findNearbyPlace, reverseGeocode } from './api/search'
import { BrowseResults } from './components/BrowseResults'
import { CategoryChips } from './components/CategoryChips'
import { ContextMenu, type MenuAction } from './components/ContextMenu'
import { LayerPicker } from './components/LayerPicker'
import { CarOptions } from './components/CarOptions'
import { AdditionalOptions } from './components/AdditionalOptions'
import { DirectionsForm } from './components/DirectionsForm'
import { Icon } from './components/icons'
import { PitchToggle } from './components/PitchToggle'
import { PlaceCard } from './components/PlaceCard'
import { PlaceEditor, type PlaceDraft } from './components/PlaceEditor'
import { RouteCard } from './components/RouteCard'
import { SearchBar } from './components/SearchBar'
import { SearchThisArea } from './components/SearchThisArea'
import { Sheet } from './components/Sheet'
import { TransitCard } from './components/TransitCard'
import { TransitOptions } from './components/TransitOptions'
import { COLORS, CYCLING_STYLES, TRANSIT_PROFILE, type CarAvoid } from './config'
import { useBrowse, type BrowseSearch } from './hooks/useBrowse'
import { matchCategories, useCategories } from './hooks/useCategories'
import { useProfiles } from './hooks/useProfiles'
import { useNavigation, type Travel } from './hooks/useNavigation'
import { useRoute } from './hooks/useRoute'
import { useLanes } from './hooks/useLanes'
import { PHONE_QUERY, useMediaQuery } from './hooks/useMediaQuery'
import { useStoredLook } from './hooks/useStoredLook'
import { useTransitModes } from './hooks/useTransitModes'
import { useTransitPlan } from './hooks/useTransitPlan'
import { NavigationView } from './components/NavigationView'
import { linkedView } from './linkedView'
import { MapCanvas } from './map/MapCanvas'
import { useMap } from './map/MapContext'
import { MapControl } from './map/MapControl'
import { MapDot } from './map/MapDot'
import { MapMarker } from './map/MapMarker'
import { PoiLayer } from './map/PoiLayer'
import { poiKey } from './map/poiLayers'
import { RouteLine } from './map/RouteLine'
import { useCamera } from './map/useCamera'
import { useMapInteractions, type MapPoi } from './map/useMapInteractions'
import { useFollowCamera } from './map/useFollowCamera'
import { useMapLook } from './map/useMapLook'
import { UserLocation } from './map/UserLocation'
import { useIsTilted } from './map/useIsTilted'
import { useTerrainInfo } from './map/useTerrainInfo'
import { useMoveCount } from './map/useMoveCount'
import type {
  Category,
  End,
  Itinerary,
  LngLat,
  PhotonFeature,
  PlaceSnapshot,
  Poi,
  RouteSegment,
  TransitLeg,
  TripTime,
  Waypoint,
} from './types'
import { coordLabel } from './utils/format'
import { boundsOf } from './utils/geo'
import { currentPosition, isLocationAllowed, LOCATION_NEEDS_HTTPS } from './utils/location'
import { prepareRoute } from './utils/navigation'
import { itineraryToPath } from './utils/transitNavigation'
import { useVoice } from './hooks/useVoice'
import { useWakeLock } from './hooks/useWakeLock'
import { requestCompass } from './hooks/useCompass'
import { useNavigationHeading } from './hooks/useNavigationHeading'
import { downloadFile, fileSlug, toGpx } from './utils/gpx'
import {
  describePlace,
  placePosition,
  poiToPlace,
  pointPlace,
  snapshotToWaypoint,
  toSnapshot,
  toWaypoint,
} from './utils/places'
import { categoryShortcut, recentShortcut, savedPlaceShortcut } from './utils/shortcuts'
import './App.css'

type Mode = 'search' | 'directions'

interface Menu {
  x: number
  y: number
  position: LngLat
  /** The "What's here?" place showing when it opened, and whether it opened on its dot */
  whatsHere: { place: PhotonFeature; onDot: boolean } | null
}

/** A browse search, and how far the map had moved when it ran (for "Search this area"). */
interface Browse extends BrowseSearch {
  moveCount: number
}

/** A new place being added at a point on the map */
interface Adding {
  position: LngLat
  draft: PlaceDraft
}

const NO_WAYPOINTS = { from: null, to: null }

/** Add ?simulate to the address to try navigation without going anywhere */
const SIMULATE = new URLSearchParams(location.search).has('simulate')
const NO_POIS: Poi[] = []
/** How close to the "What's here?" dot (px) a menu counts as opened on it: room for a finger */
const ON_DOT_PX = 24

/** Rides in the route's own colour, walks dotted. */
function legSegment(leg: TransitLeg): RouteSegment {
  return leg.isTransit
    ? { geometry: leg.geometry, color: leg.route?.color ?? COLORS.route }
    : { geometry: leg.geometry, color: COLORS.walk, walking: true }
}

export default function App() {
  // What covers the map, so the camera can keep things in view around it
  const panelRef = useRef<HTMLElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const isPhone = useMediaQuery(PHONE_QUERY)
  const overlays = useMemo(() => ({ panel: panelRef, top: topRef, sheet: sheetRef }), [])
  const camera = useCamera(overlays)
  const account = useAccount()

  // Map type and overlays, remembered on this device
  const [look, setLook] = useStoredLook()
  const terrain = useTerrainInfo()
  const isTilted = useIsTilted()
  useMapLook(look, terrain, isTilted)

  const [mode, setMode] = useState<Mode>('search')
  const [place, setPlace] = useState<PhotonFeature | null>(null)
  /** The place "What's here?" last found: while it's the one shown, it's marked with a dot */
  const [whatsHere, setWhatsHere] = useState<PhotonFeature | null>(null)
  const [waypoints, setWaypoints] = useState<Record<End, Waypoint | null>>(NO_WAYPOINTS)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [adding, setAdding] = useState<Adding | null>(null)
  /** Why "Your location" or navigation couldn't start, if it couldn't */
  const [locationProblem, setLocationProblem] = useState<string | null>(null)

  /* ---------- routing ---------- */

  const { profiles, carAvoids, steepHills: canAvoidSteepHills } = useProfiles()
  const [chosenProfile, setChosenProfile] = useState<string | null>(null)
  // Fixed when navigation starts, so every reroute uses the same kind of route
  // (e.g. the gravel bike profile), whatever the travel-mode buttons say
  const [navigationProfile, setNavigationProfile] = useState<string | null>(null)
  const isNavigating = navigationProfile !== null
  const profile = navigationProfile ?? chosenProfile ?? profiles[0]

  const isTransit = profile === TRANSIT_PROFILE
  const from = waypoints.from?.position ?? null
  const to = waypoints.to?.position ?? null

  // Walking, cycling and driving come from GraphHopper; public transport from OpenTripPlanner
  const [avoid, setAvoid] = useState<CarAvoid[]>([])
  const [avoidSteepHills, setAvoidSteepHills] = useState(false)
  const isOnFootOrBike = profile === 'foot' || profile in CYCLING_STYLES
  /** The point on the route under the elevation chart's cursor */
  const [elevationAt, setElevationAt] = useState<LngLat | null>(null)
  const route = useRoute(
    isTransit ? null : from,
    isTransit ? null : to,
    profile,
    profile === 'car'
      ? { avoid: avoid.filter((name) => carAvoids.includes(name)) }
      : isOnFootOrBike && canAvoidSteepHills
        ? { avoidSteepHills }
        : undefined,
  )
  const [tripTime, setTripTime] = useState<TripTime | null>(null)
  const transitModes = useTransitModes(isTransit)
  const [excludedModes, setExcludedModes] = useState<string[]>([])
  const transitPlan = useTransitPlan(isTransit ? from : null, isTransit ? to : null, {
    time: tripTime,
    // Only send a mode list when something's been turned off
    modes: excludedModes.length
      ? transitModes.filter((mode) => !excludedModes.includes(mode))
      : null,
  })

  // Show the journey option the user picked, or the first one
  const [chosenItinerary, setChosenItinerary] = useState<Itinerary | null>(null)
  const itineraries = transitPlan.status === 'ready' ? transitPlan.data : []
  const itinerary =
    itineraries.find((option) => option === chosenItinerary) ?? itineraries[0] ?? null

  const routePath = route.status === 'ready' ? route.data : null
  const routeSegments = useMemo<RouteSegment[]>(() => {
    if (itinerary) return itinerary.legs.map(legSegment)
    if (routePath) return [{ geometry: routePath.points, color: COLORS.route }]
    return []
  }, [itinerary, routePath])

  /* ---------- turn-by-turn navigation ---------- */

  const travel: Travel = isTransit
    ? 'transit'
    : profile === 'foot'
      ? 'walk'
      : profile in CYCLING_STYLES
        ? 'ride'
        : 'drive'
  // Public transport journeys are followed the same way, as a line with instructions
  const navRoute = useMemo(() => {
    if (isTransit) return itinerary ? prepareRoute(itineraryToPath(itinerary)) : null
    return routePath ? prepareRoute(routePath) : null
  }, [isTransit, itinerary, routePath])
  // Lanes for the route's turns, looked up once navigation starts (not for public transport)
  const lanes = useLanes(isNavigating && !isTransit ? (navRoute?.path ?? null) : null)
  const voice = useVoice()
  useWakeLock(isNavigating)

  const navigation = useNavigation({
    route: navRoute,
    active: isNavigating,
    travel,
    simulate: SIMULATE,
    speak: voice.speak,
    // Off the route: ask for a new one from here. Only the start changes; the route reloads
    // with the same profile and destination as the original
    onOffRoute: (at) =>
      setWaypoints((prev) => ({ ...prev, from: { position: at, label: 'Your location' } })),
  })

  // Show yourself on the route when close to it (steadier than raw GPS), else where GPS says
  const { fix, progress } = navigation
  const isOnRoute = progress !== null && progress.offRoute < 30
  const youAt = isOnRoute ? progress.snapped : (fix?.at ?? null)
  const heading = useNavigationHeading(navigation, navRoute, isOnRoute, isNavigating && !SIMULATE)
  const [isNavigation3d, setIsNavigation3d] = useState(true)
  const follow = useFollowCamera(isNavigating, youAt, heading.camera, travel, isNavigation3d)

  function startNavigation() {
    // Location (and so navigation) needs a secure connection: HTTPS, or localhost
    if (!window.isSecureContext && !SIMULATE) {
      setLocationProblem(`${LOCATION_NEEDS_HTTPS} Navigation needs it to follow you.`)
      return
    }
    setLocationProblem(null)
    // Speaking during the tap lets mobile browsers allow speech for the rest of the trip
    const first = navRoute?.path.instructions[0]
    if (first) voice.speak(first.text)
    requestCompass()
    setMenu(null)
    follow.recentre()
    setNavigationProfile(profile)
  }

  // Lets CSS make room for the navigation screen (see App.css)
  useEffect(() => {
    document.documentElement.classList.toggle('is-navigating', isNavigating)
  }, [isNavigating])

  // After navigating, the route is shown flat again (its fit would otherwise keep the tilt)
  const wasNavigating = useRef(false)
  useEffect(() => {
    if (isNavigating) {
      wasNavigating.current = true
      return // the camera follows you instead
    }
    const bounds = boundsOf(routeSegments.map((segment) => segment.geometry))
    if (bounds) camera.fitBounds(bounds, wasNavigating.current)
    wasNavigating.current = false
  }, [routeSegments, camera, isNavigating])

  /* ---------- browse ---------- */

  const categories = useCategories()
  const moveCount = useMoveCount()
  const [browse, setBrowse] = useState<Browse | null>(null)
  const browseState = useBrowse(browse)
  const pois = browseState.status === 'ready' ? browseState.data.results : NO_POIS
  const hasMovedSinceBrowse = browse !== null && moveCount > browse.moveCount

  function browseCategory(category: Category) {
    const area = camera.visibleArea()
    if (!area) return
    account.addRecent({ query: category.label, category: category.id })
    setPlace(null)
    setBrowse({ category, ...area, moveCount })
  }

  function searchThisArea() {
    const area = camera.visibleArea()
    if (browse && area) setBrowse({ ...browse, ...area, moveCount })
  }

  function closeBrowse() {
    setBrowse(null)
    setPlace(null)
  }

  // The search bar shows what's open, and clearing it closes that
  const searchValue = place
    ? describePlace(place).name
    : browse && mode === 'search'
      ? browse.category.label
      : ''

  function selectResult(poi: Poi) {
    setPlace(poiToPlace(poi))
    camera.flyTo({ lng: poi.lng, lat: poi.lat }, 15)
  }

  /* ---------- places ---------- */

  /** Opens a place's card, and moves the map to it unless `move` is false. */
  function showPlace(feature: PhotonFeature, move = true) {
    setPlace(feature)
    if (mode !== 'search' || !move) return

    const extent = feature.properties.extent // [minLon, maxLat, maxLon, minLat]
    if (extent) camera.fitBounds([extent[0], extent[3], extent[2], extent[1]])
    else camera.flyTo(placePosition(feature), 16)
  }

  /** A place picked from the search box. */
  function pickPlace(feature: PhotonFeature) {
    account.addRecent({ query: describePlace(feature).name, place: toSnapshot(feature) })
    setBrowse(null)
    showPlace(feature)
  }

  /** A saved place or recent search, looked up again for its current details. */
  async function showSnapshot(snapshot: PlaceSnapshot) {
    setBrowse(null)
    const position = { lng: snapshot.lng, lat: snapshot.lat }
    // By id where we can (POIs and places people added), else by name near where it was
    const byId =
      snapshot.osmType && snapshot.osmId
        ? await getPlace({ type: snapshot.osmType, id: snapshot.osmId }).catch(() => null)
        : null
    const found = byId ? poiToPlace(byId) : await findNearbyPlace(snapshot.name, position)
    showPlace(found ?? pointPlace(position, snapshot.name))
  }

  async function showPoi(poi: MapPoi) {
    // Search knows more about a business (address, hours) than the map tile does
    const found = await findNearbyPlace(poi.name, poi.position)
    showPlace(found ?? pointPlace(poi.position, poi.name, poi.kind))
  }

  // Bumped whenever something else opens, so a slow "What's here?" lookup doesn't replace it
  const whatsHereLookup = useRef(0)
  useEffect(() => {
    whatsHereLookup.current++
  }, [place, mode, browse])

  async function showWhatsHere(position: LngLat, move = true) {
    const lookup = ++whatsHereLookup.current
    const found = await reverseGeocode(position)
    if (whatsHereLookup.current !== lookup) return
    const feature: PhotonFeature = found
      ? { ...found, geometry: { coordinates: [position.lng, position.lat] } }
      : pointPlace(position, coordLabel(position))
    setWhatsHere(feature)
    showPlace(feature, move)
  }
  const isWhatsHere = place !== null && place === whatsHere

  // Opened from a link to a spot: say what's there, leaving the map where the link put it
  const map = useMap()
  const showLinkedSpot = useEffectEvent((at: LngLat) => showWhatsHere(at, false))
  useEffect(() => {
    if (map && linkedView?.marker) showLinkedSpot(linkedView.marker)
  }, [map])

  /* ---------- directions ---------- */

  /** Sets a route end, and the other one to `fill` if that's still empty. */
  function setWaypoint(end: End, waypoint: Waypoint, fill?: Waypoint) {
    const otherName = end === 'from' ? 'to' : 'from'
    const otherEnd = waypoints[otherName] ?? fill
    setWaypoints((prev) => ({ ...prev, [otherName]: prev[otherName] ?? fill, [end]: waypoint }))
    setPlace(null)
    setMode('directions')
    // With both ends set, the route zooms the map once it loads
    if (!otherEnd) camera.flyTo(waypoint.position, 13)
  }

  /** Sets a route end from a bare point, then names it once search finds what's there. */
  async function setWaypointAt(end: End, position: LngLat, fill?: Waypoint) {
    setWaypoint(end, { position, label: coordLabel(position) }, fill)

    const found = await reverseGeocode(position)
    if (!found) return
    const label = describePlace(found).name
    // Skip if that end has moved again in the meantime
    setWaypoints((prev) =>
      prev[end]?.position === position ? { ...prev, [end]: { position, label } } : prev,
    )
  }

  function pickWaypoint(end: End, feature: PhotonFeature) {
    account.addRecent({ query: describePlace(feature).name, place: toSnapshot(feature) })
    setWaypoint(end, toWaypoint(feature))
  }

  /** Sets a route end to wherever the device is now. */
  async function setWaypointToHere(end: End) {
    setLocationProblem(null)
    try {
      setWaypoint(end, { position: await currentPosition(), label: 'Your location' })
    } catch (err) {
      setLocationProblem((err as Error).message)
    }
  }

  async function openDirections() {
    if (place) setWaypoint('to', toWaypoint(place))
    else setMode('directions')
    // Start from here, like other map apps, if that needs no permission prompt
    if (!waypoints.from && (await isLocationAllowed())) setWaypointToHere('from')
  }

  function closeDirections() {
    setMode('search')
    setWaypoints(NO_WAYPOINTS)
    setPlace(null)
  }

  function swapEnds() {
    setWaypoints(({ from, to }) => ({ from: to, to: from }))
  }

  // Walks and rides can be taken to a GPS or bike computer
  const canExportGpx = isOnFootOrBike

  function exportGpx() {
    if (!routePath) return
    const activity = profile === 'foot' ? 'Walk' : 'Ride'
    const name = `${activity}: ${waypoints.from?.label ?? 'Start'} to ${waypoints.to?.label ?? 'Destination'}`
    downloadFile(`${fileSlug(name)}.gpx`, toGpx(name, routePath.points), 'application/gpx+xml')
  }

  /* ---------- dropdown shortcuts ---------- */

  const searchShortcuts = [
    ...account.savedPlaces.map((saved) => savedPlaceShortcut(saved, () => showSnapshot(saved))),
    ...account.recents.slice(0, 8).map((recent) =>
      recentShortcut(recent, () => {
        const category = categories.find((c) => c.id === recent.category)
        if (category) {
          browseCategory(category)
        } else if (recent.place) {
          account.addRecent(recent) // moves it back to the top
          showSnapshot(recent.place)
        }
      }),
    ),
  ]

  const suggestCategories = (text: string) =>
    matchCategories(categories, text).map((category) =>
      categoryShortcut(category, () => browseCategory(category)),
    )

  const waypointShortcuts = (end: End) => [
    {
      key: 'here',
      label: 'Your location',
      icon: 'locate' as const,
      onSelect: () => setWaypointToHere(end),
    },
    ...account.savedPlaces.map((saved) =>
      savedPlaceShortcut(saved, () =>
        setWaypoint(end, { ...snapshotToWaypoint(saved), label: saved.label }),
      ),
    ),
    ...account.recents
      .filter((recent) => recent.place)
      .slice(0, 6)
      .map((recent) =>
        recentShortcut(recent, () => setWaypoint(end, snapshotToWaypoint(recent.place!))),
      ),
  ]

  /* ---------- map interactions ---------- */

  useMapInteractions({
    onResultClick: (key) => {
      const poi = pois.find((p) => poiKey(p) === key)
      if (poi) selectResult(poi)
    },
    onPoiClick: showPoi,
    onContextMenu: (at, position) => setMenu({ ...at, position, whatsHere: whatsHereAt(at) }),
    onDismiss: () => setMenu(null),
  })

  function handleMenuAction(action: MenuAction) {
    if (!menu) return
    setMenu(null)
    if (action === 'what') showWhatsHere(menu.position)
    else if (action === 'add') startAdding(menu.position)
    else menuDirections(action, menu)
  }

  /**
   * The "What's here?" place, and whether a point on the map (px) is on its dot, as the user sees
   * it now. None if the dot can't be found, as the route's ends might then meet.
   */
  function whatsHereAt({ x, y }: { x: number; y: number }) {
    const dot = isWhatsHere && camera.project(placePosition(place))
    if (!dot) return null
    return { place, onDot: Math.hypot(dot.x - x, dot.y - y) < ON_DOT_PX }
  }

  /**
   * Directions from or to somewhere else go to or from the "What's here?" spot, if that end of
   * the route is still empty. Opened on its dot, they start or end at the place itself.
   */
  function menuDirections(end: End, { position, whatsHere: opened }: Menu) {
    if (!opened) return setWaypointAt(end, position)
    const here = toWaypoint(opened.place)
    if (opened.onDot) setWaypoint(end, here)
    else setWaypointAt(end, position, here)
  }

  /** Opens the "Add a place" form, with the address filled in from what's at that spot. */
  async function startAdding(position: LngLat) {
    if (!account.user) {
      account.requestSignIn()
      return
    }
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
    setAdding({ position, draft: { name: '', category: '', tags } })
  }

  /* ---------- render ---------- */

  const isBrowsing = mode === 'search' && browse !== null
  const selectedKey = place?.properties.osm_type
    ? `${place.properties.osm_type}${place.properties.osm_id}`
    : null

  /** What the panel shows, the key that marks it as new, and what its close button does */
  function panelBody() {
    if (place) {
      return {
        content: (
          <PlaceCard
            place={place}
            onDirections={(end) => setWaypoint(end, toWaypoint(place))}
            onBack={isBrowsing ? () => setPlace(null) : undefined}
          />
        ),
        key: `place:${place.geometry.coordinates.join()}`,
        // Like the search bar's clear button, which shows the place
        onClose: mode === 'search' ? closeBrowse : () => setPlace(null),
      }
    }
    if (mode === 'directions') {
      // Nothing to show until both ends are set; an empty sheet would stand at half height
      if (!from || !to) return null
      return {
        content: isTransit ? (
          <TransitCard
            plan={transitPlan}
            selected={itinerary}
            onSelect={setChosenItinerary}
            onLegClick={(at) => camera.flyTo(at, 16)}
            onStart={startNavigation}
          />
        ) : (
          <RouteCard
            route={route}
            onStepClick={(at) => camera.flyTo(at, 16)}
            onExportGpx={canExportGpx ? exportGpx : undefined}
            onStart={startNavigation}
            showElevation={travel === 'walk' || travel === 'ride'}
            onElevationHover={setElevationAt}
          />
        ),
        key: `directions:${profile}`,
        onClose: closeDirections,
      }
    }
    if (isBrowsing) {
      return {
        content: (
          <BrowseResults
            category={browse.category}
            state={browseState}
            onSelect={selectResult}
            // On phones the sheet's own close button does this
            onClose={isPhone ? undefined : closeBrowse}
          />
        ),
        key: `browse:${browse.category.id}`,
        onClose: closeBrowse,
      }
    }
    return null
  }

  const body = panelBody()

  return (
    <>
      <MapCanvas />
      <MapControl position="top-right">
        <LayerPicker look={look} onChange={setLook} hasTerrain={terrain !== null} />
      </MapControl>
      <MapControl position="top-right">
        <PitchToggle is3d={isTilted} />
      </MapControl>
      <RouteLine segments={routeSegments} />
      <PoiLayer pois={isBrowsing ? pois : NO_POIS} selectedKey={selectedKey} />

      {mode === 'search' && place && !isWhatsHere && (
        <MapMarker position={placePosition(place)} color={COLORS.route} />
      )}
      {mode === 'directions' && waypoints.from && !isNavigating && (
        <MapMarker
          position={waypoints.from.position}
          color={COLORS.start}
          onDragEnd={(at) => setWaypointAt('from', at)}
        />
      )}
      {mode === 'directions' && waypoints.to && (
        <MapMarker
          position={waypoints.to.position}
          color={COLORS.route}
          onDragEnd={(at) => setWaypointAt('to', at)}
        />
      )}

      {mode === 'directions' && !isNavigating && elevationAt && <MapDot position={elevationAt} />}
      {isWhatsHere && !isNavigating && (
        <MapDot position={placePosition(place)} className="map-dot--query">
          <Icon name="search" />
        </MapDot>
      )}

      {isBrowsing && hasMovedSinceBrowse && <SearchThisArea onClick={searchThisArea} />}

      {isNavigating && youAt && <UserLocation at={youAt} heading={heading.marker} />}
      {isNavigating && (
        <NavigationView
          guidance={navigation.guidance}
          arrivesAt={isTransit ? itinerary?.end : undefined}
          lanes={navigation.guidance ? (lanes.get(navigation.guidance.nextIndex) ?? null) : null}
          status={navigation.error}
          isRerouting={(isTransit ? transitPlan.status : route.status) === 'loading'}
          isSimulated={SIMULATE}
          isMuted={voice.muted}
          onToggleMute={voice.toggleMuted}
          isFollowing={follow.isFollowing}
          onRecentre={follow.recentre}
          is3d={isNavigation3d}
          onToggle3d={() => setIsNavigation3d(!isNavigation3d)}
          onEnd={() => setNavigationProfile(null)}
        />
      )}

      <aside ref={panelRef} className="panel" hidden={isNavigating}>
        <div ref={topRef} className="panel__top glass">
          {mode === 'search' ? (
            <>
              <SearchBar
                value={searchValue}
                onClear={closeBrowse}
                onPick={pickPlace}
                onDirections={openDirections}
                shortcuts={searchShortcuts}
                suggest={suggestCategories}
              />
              <CategoryChips
                categories={categories}
                activeId={isBrowsing ? browse.category.id : null}
                onSelect={browseCategory}
              />
            </>
          ) : (
            <DirectionsForm
              from={waypoints.from}
              to={waypoints.to}
              profiles={profiles}
              profile={profile}
              onPick={pickWaypoint}
              shortcutsFor={waypointShortcuts}
              onProfileChange={setChosenProfile}
              onSwap={swapEnds}
              onClose={closeDirections}
            />
          )}
          {mode === 'directions' && locationProblem && (
            <p className="error panel__problem" role="alert">
              {locationProblem}
            </p>
          )}
          {mode === 'directions' && profile === 'car' && (
            <CarOptions available={carAvoids} avoid={avoid} onChange={setAvoid} />
          )}
          {mode === 'directions' && isOnFootOrBike && canAvoidSteepHills && (
            <AdditionalOptions
              avoidSteepHills={avoidSteepHills}
              onAvoidSteepHillsChange={setAvoidSteepHills}
            />
          )}
          {mode === 'directions' && isTransit && (
            <TransitOptions
              time={tripTime}
              onTimeChange={setTripTime}
              modes={transitModes}
              excluded={excludedModes}
              onExcludedChange={setExcludedModes}
            />
          )}
        </div>
        {body && (
          // The sheet re-opens to its low height whenever it starts showing something new
          <Sheet ref={sheetRef} contentKey={body.key} topRef={topRef} onClose={body.onClose}>
            {body.content}
          </Sheet>
        )}
      </aside>

      {adding && (
        <PlaceEditor
          place={null}
          position={adding.position}
          initial={adding.draft}
          onSaved={(details) => {
            setAdding(null)
            showPlace(poiToPlace(details))
          }}
          onClose={() => setAdding(null)}
        />
      )}

      {menu && (
        <ContextMenu
          key={`${menu.x},${menu.y}`}
          x={menu.x}
          y={menu.y}
          position={menu.position}
          onSelect={handleMenuAction}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}
