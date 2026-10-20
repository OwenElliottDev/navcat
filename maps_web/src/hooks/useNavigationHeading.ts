import { useMemo, useState } from 'react'
import { bearingBetween } from '../utils/geo'
import { facingHeading, followsRoute, isMovingBriskly } from '../utils/heading'
import { pointAlong, type NavRoute } from '../utils/navigation'
import { useCompass } from './useCompass'
import type { NavigationState } from './useNavigation'

/**
 * Which way the "you are here" arrow and the camera point while navigating. The arrow shows the
 * way you're really facing (null leaves a dot). The camera faces down the route while you're
 * going along it, else the way you're facing.
 */
export function useNavigationHeading(
  navigation: NavigationState,
  route: NavRoute | null,
  isOnRoute: boolean,
  useSensors: boolean,
): { marker: number | null; camera: number } {
  const { course, speed, progress } = navigation
  // Moving briskly, the direction of travel is used, so the compass can rest
  const compass = useCompass(useSensors && !isMovingBriskly(speed))
  const facing = facingHeading(course, speed, compass)

  // Down the route: towards a point a little ahead (it starts turning just before a corner)
  const routeHeading = useMemo(
    () =>
      isOnRoute && route && progress
        ? bearingBetween(progress.snapped, pointAlong(route, progress.along + 40))
        : null,
    [isOnRoute, route, progress],
  )

  const [wasFacingRoute, setWasFacingRoute] = useState(true)
  const facesRoute = followsRoute(facing, routeHeading, wasFacingRoute)
  if (facesRoute !== wasFacingRoute) setWasFacingRoute(facesRoute)

  return {
    marker: facing ?? routeHeading,
    // Off the route with nothing to go on, it faces along the nearest stretch
    camera: facesRoute ? routeHeading! : (facing ?? progress?.bearing ?? 0),
  }
}
