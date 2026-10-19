import type { RefObject } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { useAppStore } from '../store'
import {
  selectIsNavigating,
  selectIsOnFootOrBike,
  selectIsTransit,
  selectItinerary,
  selectProfile,
  selectTravel,
} from '../store/selectors'
import { downloadFile, fileSlug, toGpx } from '../utils/gpx'
import { toWaypoint } from '../utils/places'
import { BrowseResults } from './BrowseResults'
import { PanelTop } from './PanelTop'
import { PlaceCard } from './PlaceCard'
import { RouteCard } from './RouteCard'
import { Sheet } from './Sheet'
import { TransitCard } from './TransitCard'

interface PanelProps {
  panelRef: RefObject<HTMLElement | null>
  topRef: RefObject<HTMLDivElement | null>
  sheetRef: RefObject<HTMLDivElement | null>
}

/** The side panel on desktop, or the top bar and bottom sheet on phones. */
export function Panel({ panelRef, topRef, sheetRef }: PanelProps) {
  const isPhone = useMediaQuery(PHONE_QUERY)
  const { mode, place, browse, waypoints, route, transitPlan, browseResults, camera } = useAppStore(
    useShallow((s) => ({
      mode: s.mode,
      place: s.place,
      browse: s.browse,
      waypoints: s.waypoints,
      route: s.route,
      transitPlan: s.transitPlan,
      browseResults: s.browseResults,
      camera: s.camera,
    })),
  )
  const actions = useAppStore.getState()
  const profile = useAppStore(selectProfile)
  const isTransit = useAppStore(selectIsTransit)
  const travel = useAppStore(selectTravel)
  const itinerary = useAppStore(selectItinerary)
  const isNavigating = useAppStore(selectIsNavigating)
  const isBrowsing = mode === 'search' && browse !== null
  // Walks and rides can be taken to a GPS or bike computer
  const canExportGpx = useAppStore(selectIsOnFootOrBike)

  function exportGpx() {
    if (route.status !== 'ready') return
    const activity = profile === 'foot' ? 'Walk' : 'Ride'
    const name = `${activity}: ${waypoints.from?.label ?? 'Start'} to ${waypoints.to?.label ?? 'Destination'}`
    downloadFile(`${fileSlug(name)}.gpx`, toGpx(name, route.data.points), 'application/gpx+xml')
  }

  /** What the panel shows, the key that marks it as new, and what its close button does */
  function panelBody() {
    if (place) {
      return {
        content: (
          <PlaceCard
            place={place}
            onDirections={(end) => actions.setWaypoint(end, toWaypoint(place))}
            onBack={isBrowsing ? () => actions.setPlace(null) : undefined}
          />
        ),
        key: `place:${place.geometry.coordinates.join()}`,
        // Like the search bar's clear button, which shows the place
        onClose: mode === 'search' ? actions.closeBrowse : () => actions.setPlace(null),
      }
    }
    if (mode === 'directions') {
      // Nothing to show until both ends are set; an empty sheet would stand at half height
      if (!waypoints.from || !waypoints.to) return null
      return {
        content: isTransit ? (
          <TransitCard
            plan={transitPlan}
            selected={itinerary}
            onSelect={actions.chooseItinerary}
            onLegClick={(at) => camera?.flyTo(at, 16)}
            onStart={actions.startNavigation}
          />
        ) : (
          <RouteCard
            route={route}
            onStepClick={(at) => camera?.flyTo(at, 16)}
            onExportGpx={canExportGpx ? exportGpx : undefined}
            onStart={actions.startNavigation}
            showElevation={travel === 'walk' || travel === 'ride'}
            onElevationHover={actions.setElevationAt}
          />
        ),
        key: `directions:${profile}`,
        onClose: actions.closeDirections,
      }
    }
    if (isBrowsing) {
      return {
        content: (
          <BrowseResults
            category={browse.category}
            state={browseResults}
            onSelect={actions.selectResult}
            // On phones the sheet's own close button does this
            onClose={isPhone ? undefined : actions.closeBrowse}
          />
        ),
        key: `browse:${browse.category.id}`,
        onClose: actions.closeBrowse,
      }
    }
    return null
  }

  const body = panelBody()

  return (
    <aside ref={panelRef} className="panel" hidden={isNavigating}>
      <div ref={topRef} className="panel__top glass">
        <PanelTop />
      </div>
      {body && (
        // The sheet re-opens to its low height whenever it starts showing something new
        <Sheet ref={sheetRef} contentKey={body.key} topRef={topRef} onClose={body.onClose}>
          {body.content}
        </Sheet>
      )}
    </aside>
  )
}
