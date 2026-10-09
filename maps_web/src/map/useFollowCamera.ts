import { useEffect, useState } from 'react'
import type { MapLibreEvent } from 'maplibre-gl'
import type { LngLat } from '../types'
import { useMap } from './MapContext'

const ZOOM = { walk: 17.5, ride: 17, drive: 16.5, transit: 16.5 }

/**
 * Keeps the map on you while navigating: tilted, turned to face the way you're going, with
 * you low on the screen so more of the road ahead shows. Dragging the map stops following
 * until `recentre` is called.
 */
export function useFollowCamera(
  active: boolean,
  at: LngLat | null,
  heading: number,
  travel: keyof typeof ZOOM,
) {
  const map = useMap()
  const [isFollowing, setIsFollowing] = useState(true)

  // A drag or rotate by the user (not by us) stops following
  useEffect(() => {
    if (!map || !active) return
    const stop = (e: MapLibreEvent & { originalEvent?: Event }) => {
      if (e.originalEvent) setIsFollowing(false)
    }
    map.on('dragstart', stop)
    map.on('rotatestart', stop)
    return () => {
      map.off('dragstart', stop)
      map.off('rotatestart', stop)
    }
  }, [map, active])

  useEffect(() => {
    if (!map || !active || !at || !isFollowing) return
    map.easeTo({
      center: [at.lng, at.lat],
      bearing: heading,
      pitch: 55,
      zoom: ZOOM[travel],
      // Room for the instruction banner above and the trip bar below; you sit low on screen
      padding: { top: window.innerHeight * 0.4, bottom: 110, left: 20, right: 20 },
      duration: 900,
      easing: (t) => t,
    })
  }, [map, active, at, heading, travel, isFollowing])

  // Back to a flat, north-up map when navigation ends
  useEffect(() => {
    if (!map || active) return
    if (map.getPitch() !== 0 || map.getBearing() !== 0)
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 })
  }, [map, active])

  return { isFollowing, recentre: () => setIsFollowing(true) }
}
