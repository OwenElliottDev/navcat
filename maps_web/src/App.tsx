import { useEffect, useMemo, useRef, useState } from 'react'
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
import { useStoredLook } from './hooks/useStoredLook'
import { useTransitModes } from './hooks/useTransitModes'
import { useTransitPlan } from './hooks/useTransitPlan'
import { NavigationView } from './components/NavigationView'
import { MapCanvas } from './map/MapCanvas'
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
import { bearingBetween, pointAlong, prepareRoute } from './utils/navigation'
import { itineraryToPath } from './utils/transitNavigation'
import { useVoice } from './hooks/useVoice'
import { useWakeLock } from './hooks/useWakeLock'
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
  const overlays = useMemo(() => ({ panel: panelRef, top: topRef, sheet: sheetRef }), [])
  const camera = useCamera(overlays)
  const account = useAccount()

  // Map type and overlays, remembered on this device
  const [look, setLook] = useStoredLook()
  const terrain = useTerrainInfo()
  useMapLook(look, terrain)

  const [mode, setMode] = useState<Mode>('search')
  const [place, setPlace] = useState<PhotonFeature | null>(null)
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
  // Face down the route: towards a point a little ahead (steadier than the GPS compass, and
  // it starts turning just before a corner). Off the route, use the compass if there is one
  const ahead = isOnRoute && navRoute ? pointAlong(navRoute, progress.along + 40) : null
  const heading = ahead
    ? bearingBetween(progress!.snapped, ahead)
    : (fix?.heading ?? progress?.bearing ?? 0)
  const follow = useFollowCamera(isNavigating, youAt, heading, travel)

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
    setMenu(null)
    follow.recentre()
    setNavigationProfile(profile)
  }

  // Lets CSS make room for the navigation screen (see App.css)
  useEffect(() => {
    document.documentElement.classList.toggle('is-navigating', isNavigating)
  }, [isNavigating])

  useEffect(() => {
    if (isNavigating) return // the camera follows you instead
    const bounds = boundsOf(routeSegments.map((segment) => segment.geometry))
    if (bounds) camera.fitBounds(bounds)
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

  function showPlace(feature: PhotonFeature) {
    setPlace(feature)
    if (mode !== 'search') return

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

  async function showWhatsHere(position: LngLat) {
    const found = await reverseGeocode(position)
    showPlace(
      found
        ? { ...found, geometry: { coordinates: [position.lng, position.lat] } }
        : pointPlace(position, coordLabel(position)),
    )
  }

  /* ---------- directions ---------- */

  function setWaypoint(end: End, waypoint: Waypoint) {
    const otherEnd = end === 'from' ? waypoints.to : waypoints.from
    setWaypoints((prev) => ({ ...prev, [end]: waypoint }))
    setPlace(null)
    setMode('directions')
    // With both ends set, the route zooms the map once it loads
    if (!otherEnd) camera.flyTo(waypoint.position, 13)
  }

  /** Sets a route end from a bare point, then names it once search finds what's there. */
  async function setWaypointAt(end: End, position: LngLat) {
    setWaypoint(end, { position, label: coordLabel(position) })

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
    onContextMenu: ({ x, y }, position) => setMenu({ x, y, position }),
    onDismiss: () => setMenu(null),
  })

  function handleMenuAction(action: MenuAction) {
    if (!menu) return
    setMenu(null)
    if (action === 'what') showWhatsHere(menu.position)
    else if (action === 'add') startAdding(menu.position)
    else setWaypointAt(action, menu.position)
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

  function panelBody() {
    if (place) {
      return (
        <PlaceCard
          place={place}
          onDirections={(end) => setWaypoint(end, toWaypoint(place))}
          onBack={isBrowsing ? () => setPlace(null) : undefined}
        />
      )
    }
    if (mode === 'directions' && isTransit) {
      return (
        <TransitCard
          plan={transitPlan}
          selected={itinerary}
          onSelect={setChosenItinerary}
          onLegClick={(at) => camera.flyTo(at, 16)}
          onStart={startNavigation}
        />
      )
    }
    if (mode === 'directions') {
      return (
        <RouteCard
          route={route}
          onStepClick={(at) => camera.flyTo(at, 16)}
          onExportGpx={canExportGpx ? exportGpx : undefined}
          onStart={startNavigation}
          showElevation={travel === 'walk' || travel === 'ride'}
          onElevationHover={setElevationAt}
        />
      )
    }
    if (isBrowsing) {
      return (
        <BrowseResults
          category={browse.category}
          state={browseState}
          onSelect={selectResult}
          onClose={closeBrowse}
        />
      )
    }
    return null
  }

  const body = panelBody()
  // The sheet re-opens to half height whenever it starts showing something new
  const bodyKey = place
    ? `place:${place.geometry.coordinates.join()}`
    : mode === 'directions'
      ? `directions:${profile}`
      : `browse:${browse?.category.id}`

  return (
    <>
      <MapCanvas />
      <MapControl position="top-right">
        <LayerPicker look={look} onChange={setLook} hasTerrain={terrain !== null} />
      </MapControl>
      <RouteLine segments={routeSegments} />
      <PoiLayer pois={isBrowsing ? pois : NO_POIS} selectedKey={selectedKey} />

      {mode === 'search' && place && (
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

      {isBrowsing && hasMovedSinceBrowse && <SearchThisArea onClick={searchThisArea} />}

      {isNavigating && youAt && <UserLocation at={youAt} heading={heading} />}
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
          <Sheet ref={sheetRef} contentKey={bodyKey}>
            {body}
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
          onSelect={handleMenuAction}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}
