import { useEffect } from 'react'
import type { RouteSegment } from '../types'
import { useMap } from './MapContext'
import { setRouteSegments } from './routeLayers'

export function RouteLine({ segments }: { segments: RouteSegment[] }) {
  const map = useMap()

  useEffect(() => {
    if (map) setRouteSegments(map, segments)
  }, [map, segments])

  return null
}
