import { useEffect, useRef } from 'react'
import type { MapLibreEvent } from 'maplibre-gl'
import { useAppStore } from '../store'
import type { LngLat } from '../types'
import { along, glide, turn } from './glide'
import { useMap } from './MapContext'

const ZOOM = { walk: 17.5, ride: 17, drive: 16.5, transit: 16.5 }

export interface View {
  center: [number, number]
  bearing: number
  pitch: number
  zoom: number
  padding: { top: number; bottom: number; left: number; right: number }
}

/** The view `t` (0 to 1) of the way from one to another, turning the short way round. */
export function between(from: View, to: View, t: number): View {
  return {
    center: [along(from.center[0], to.center[0], t), along(from.center[1], to.center[1], t)],
    bearing: turn(from.bearing, to.bearing, t),
    pitch: along(from.pitch, to.pitch, t),
    zoom: along(from.zoom, to.zoom, t),
    padding: {
      top: along(from.padding.top, to.padding.top, t),
      bottom: along(from.padding.bottom, to.padding.bottom, t),
      left: along(from.padding.left, to.padding.left, t),
      right: along(from.padding.right, to.padding.right, t),
    },
  }
}

/**
 * Keeps the map on you while navigating: tilted, turned to face the way you're going, with
 * you low on the screen so more of the road ahead shows. Dragging the map stops following
 * until the store's `recentre` is called.
 */
export function useFollowCamera(
  active: boolean,
  at: LngLat | null,
  heading: number,
  travel: keyof typeof ZOOM,
  is3d: boolean,
) {
  const map = useMap()
  const isFollowing = useAppStore((s) => s.isFollowing)
  const stopFollowing = useAppStore((s) => s.stopFollowing)
  // Each camera move resets MapLibre's gesture handlers, so the glide waits while a finger or
  // the mouse is down: else a drag would be lost before it got far enough to count
  const isTouched = useRef(false)

  // A drag or rotate by the user (not by us) stops following
  useEffect(() => {
    if (!map || !active) return
    const stop = (e: MapLibreEvent & { originalEvent?: Event }) => {
      if (e.originalEvent) stopFollowing()
    }
    const press = () => (isTouched.current = true)
    const release = () => (isTouched.current = false)
    const canvas = map.getCanvasContainer()
    map.on('dragstart', stop)
    map.on('rotatestart', stop)
    canvas.addEventListener('pointerdown', press)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    return () => {
      map.off('dragstart', stop)
      map.off('rotatestart', stop)
      canvas.removeEventListener('pointerdown', press)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      release()
    }
  }, [map, active, stopFollowing])

  useEffect(() => {
    if (!map || !active || !at || !isFollowing) return
    const { lng, lat } = map.getCenter()
    const from: View = {
      center: [lng, lat],
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      zoom: map.getZoom(),
      padding: { top: 0, bottom: 0, left: 0, right: 0, ...map.getPadding() },
    }
    const to: View = {
      center: [at.lng, at.lat],
      bearing: heading,
      pitch: is3d ? 55 : 0,
      zoom: ZOOM[travel],
      // Room for the instruction banner above and the trip bar below; you sit low on screen
      padding: { top: window.innerHeight * 0.4, bottom: 110, left: 20, right: 20 },
    }
    return glide((t) => {
      if (!isTouched.current) map.jumpTo(between(from, to, t))
    })
  }, [map, active, at, heading, travel, isFollowing, is3d])
}
