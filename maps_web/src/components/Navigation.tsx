import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useLanes } from '../hooks/useLanes'
import { useNavigation, type NavigationState, type Travel } from '../hooks/useNavigation'
import { useNavigationHeading } from '../hooks/useNavigationHeading'
import { useWakeLock } from '../hooks/useWakeLock'
import { UserLocation } from '../map/UserLocation'
import { useFollowCamera } from '../map/useFollowCamera'
import { useAppStore } from '../store'
import { SIMULATE } from '../store/navigation'
import {
  selectIsNavigating,
  selectIsRouteLoading,
  selectIsTransit,
  selectItinerary,
  selectNavRoute,
  selectTravel,
} from '../store/selectors'
import type { NavRoute } from '../utils/navigation'
import { NavigationView } from './NavigationView'

/**
 * Turn-by-turn: follows you along the route, speaking and showing what's next. Its own
 * component, so position updates only re-render this.
 */
export function Navigation() {
  const isNavigating = useAppStore(selectIsNavigating)
  const isTransit = useAppStore(selectIsTransit)
  const travel = useAppStore(selectTravel)
  const itinerary = useAppStore(selectItinerary)
  const navRoute = useAppStore(selectNavRoute)
  const { isRerouting, isVoiceMuted, isFollowing, isNavigation3d } = useAppStore(
    useShallow((s) => ({
      isRerouting: selectIsRouteLoading(s),
      isVoiceMuted: s.isVoiceMuted,
      isFollowing: s.isFollowing,
      isNavigation3d: s.isNavigation3d,
    })),
  )
  const { speak, rerouteFrom, toggleVoiceMuted, recentre, toggleNavigation3d, endNavigation } =
    useAppStore.getState()

  // Lanes for the route's turns, looked up once navigation starts (not for public transport)
  const lanes = useLanes(isNavigating && !isTransit ? (navRoute?.path ?? null) : null)
  useWakeLock(isNavigating)

  const navigation = useNavigation({
    route: navRoute,
    active: isNavigating,
    travel,
    simulate: SIMULATE,
    speak,
    // Off the route: ask for a new one from here, with the same profile and destination
    onOffRoute: rerouteFrom,
  })

  // Lets CSS make room for the navigation screen (see App.css)
  useEffect(() => {
    document.documentElement.classList.toggle('is-navigating', isNavigating)
  }, [isNavigating])

  return (
    <>
      <YouOnMap
        navigation={navigation}
        route={navRoute}
        travel={travel}
        isNavigating={isNavigating}
        is3d={isNavigation3d}
      />
      {isNavigating && (
        <NavigationView
          guidance={navigation.guidance}
          arrivesAt={isTransit ? itinerary?.end : undefined}
          lanes={navigation.guidance ? (lanes.get(navigation.guidance.nextIndex) ?? null) : null}
          status={navigation.error}
          isRerouting={isRerouting}
          isSimulated={SIMULATE}
          isMuted={isVoiceMuted}
          onToggleMute={toggleVoiceMuted}
          isFollowing={isFollowing}
          onRecentre={recentre}
          is3d={isNavigation3d}
          onToggle3d={toggleNavigation3d}
          onEnd={endNavigation}
        />
      )}
    </>
  )
}

/**
 * Where you are and which way you face, with the map following. Its own component, so compass
 * readings only re-render this.
 */
function YouOnMap({
  navigation,
  route,
  travel,
  isNavigating,
  is3d,
}: {
  navigation: NavigationState
  route: NavRoute | null
  travel: Travel
  isNavigating: boolean
  is3d: boolean
}) {
  // Show yourself on the route when close to it (steadier than raw GPS), else where GPS says
  const { fix, progress } = navigation
  const isOnRoute = progress !== null && progress.offRoute < 30
  const youAt = isOnRoute ? progress.snapped : (fix?.at ?? null)
  const heading = useNavigationHeading(navigation, route, isOnRoute, isNavigating && !SIMULATE)
  useFollowCamera(isNavigating, youAt, heading.camera, travel, is3d)

  return isNavigating && youAt ? <UserLocation at={youAt} heading={heading.marker} /> : null
}
