import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { COLORS } from '../config'
import { MapDot } from '../map/MapDot'
import { MapMarker } from '../map/MapMarker'
import { PoiLayer } from '../map/PoiLayer'
import { poiKey } from '../map/poiLayers'
import { RouteLine } from '../map/RouteLine'
import { useMapInteractions } from '../map/useMapInteractions'
import { useAppStore } from '../store'
import { selectIsNavigating, selectPois } from '../store/selectors'
import type { Poi } from '../types'
import { boundsOf } from '../utils/geo'
import { placePosition } from '../utils/places'
import { Icon } from './icons'
import { SearchThisArea } from './SearchThisArea'

const NO_POIS: Poi[] = []

/** What's drawn on the map (the route, browse results, pins and dots) and clicks on it. */
export function MapLayers() {
  const { mode, place, whatsHere, waypoints, elevationAt, routeSegments, camera, browse } =
    useAppStore(
      useShallow((s) => ({
        mode: s.mode,
        place: s.place,
        whatsHere: s.whatsHere,
        waypoints: s.waypoints,
        elevationAt: s.elevationAt,
        routeSegments: s.routeSegments,
        camera: s.camera,
        browse: s.browse,
      })),
    )
  const { selectResult, showPoi, openMenu, closeMenu, setWaypointAt, searchThisArea } =
    useAppStore.getState()
  const moveCount = useAppStore((s) => s.moveCount)
  const isNavigating = useAppStore(selectIsNavigating)
  const isBrowsing = mode === 'search' && browse !== null
  const pois = useAppStore(selectPois)
  const isWhatsHere = place !== null && place === whatsHere
  const hasMovedSinceBrowse = browse !== null && moveCount > browse.moveCount
  const selectedKey = place?.properties.osm_type
    ? `${place.properties.osm_type}${place.properties.osm_id}`
    : null

  useMapInteractions({
    onResultClick: (key) => {
      const poi = pois.find((p) => poiKey(p) === key)
      if (poi) selectResult(poi)
    },
    onPoiClick: showPoi,
    onContextMenu: openMenu,
    onDismiss: closeMenu,
  })

  // After navigating, the route is shown flat again (its fit would otherwise keep the tilt)
  const wasNavigating = useRef(false)
  useEffect(() => {
    if (isNavigating) {
      wasNavigating.current = true
      return // the camera follows you instead
    }
    const bounds = boundsOf(routeSegments.map((segment) => segment.geometry))
    if (bounds) camera?.fitBounds(bounds, wasNavigating.current)
    wasNavigating.current = false
  }, [routeSegments, camera, isNavigating])

  return (
    <>
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

      {isBrowsing && hasMovedSinceBrowse && (
        <SearchThisArea onClick={() => searchThisArea(moveCount)} />
      )}
    </>
  )
}
