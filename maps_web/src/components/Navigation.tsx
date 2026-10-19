import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useLanes } from '../hooks/useLanes'
import { useNavigation } from '../hooks/useNavigation'
import { useWakeLock } from '../hooks/useWakeLock'
import { UserLocation } from '../map/UserLocation'
import { useFollowCamera } from '../map/useFollowCamera'
import { useAppStore } from '../store'
import { SIMULATE } from '../store/navigation'
import {
  selectIsNavigating,
  selectIsTransit,
  selectItinerary,
  selectTravel,
} from '../store/selectors'
import { bearingBetween, pointAlong } from '../utils/navigation'
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
  const { navRoute, isRerouting, isVoiceMuted, isFollowing, isNavigation3d } = useAppStore(
    useShallow((s) => ({
      navRoute: s.navRoute,
      isRerouting: (selectIsTransit(s) ? s.transitPlan.status : s.route.status) === 'loading',
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
  useFollowCamera(isNavigating, youAt, heading, travel, isNavigation3d)

  // Lets CSS make room for the navigation screen (see App.css)
  useEffect(() => {
    document.documentElement.classList.toggle('is-navigating', isNavigating)
  }, [isNavigating])

  if (!isNavigating) return null
  return (
    <>
      {youAt && <UserLocation at={youAt} heading={heading} />}
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
    </>
  )
}
