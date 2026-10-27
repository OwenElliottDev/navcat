import { useMemo, type RefObject } from 'react'
import type { Bounds, LngLat } from '../types'
import { useMap } from './MapContext'

type Padding = { top: number; right: number; bottom: number; left: number }

/** The parts of the UI that sit over the map. */
export interface Overlays {
  /** The side column on desktop */
  panel: RefObject<HTMLElement | null>
  /** The floating search/directions bar on phones */
  top: RefObject<HTMLElement | null>
  /** The bottom sheet on phones */
  sheet: RefObject<HTMLElement | null>
}

const MARGIN = 40
const NO_PADDING: Padding = { top: 0, right: 0, bottom: 0, left: 0 }

/** Shrinks padding so at least `room` pixels of map are left each way to fit things into. */
function leaveRoom(padding: Padding, room = 120): Padding {
  const shrink = (a: number, b: number, size: number): [number, number] => {
    const excess = a + b + room - size
    if (excess <= 0) return [a, b]
    const scale = Math.max(0, (a + b - excess) / (a + b))
    return [a * scale, b * scale]
  }
  const [top, bottom] = shrink(padding.top, padding.bottom, window.innerHeight)
  const [left, right] = shrink(padding.left, padding.right, window.innerWidth)
  return { top, right, bottom, left }
}

/** Padding that keeps what the map zooms to clear of the panel (or top bar and sheet on phones). */
function paddingAround({ panel, top, sheet }: Overlays): Padding {
  const height = window.innerHeight
  if (window.innerWidth > 640) {
    const right = panel.current?.getBoundingClientRect().right ?? 0
    return leaveRoom({ top: 50, right: 70, bottom: 50, left: right + MARGIN })
  }

  const topBar = top.current?.getBoundingClientRect().bottom ?? 0
  const sheetTop = sheet.current?.getBoundingClientRect().top ?? height
  return leaveRoom({
    top: topBar + 20,
    right: MARGIN,
    bottom: height - sheetTop + 20,
    left: MARGIN,
  })
}

export type Camera = ReturnType<typeof useCamera>

export function useCamera(overlays: Overlays) {
  const map = useMap()

  return useMemo(
    () => ({
      flyTo(at: LngLat, minZoom: number) {
        // Measures the overlays a frame later, once a sheet opened or closed by the same change
        // is on screen
        requestAnimationFrame(() =>
          map?.flyTo({
            center: [at.lng, at.lat],
            zoom: Math.max(map.getZoom(), minZoom),
            padding: paddingAround(overlays),
          }),
        )
      },
      /** `flat` also turns the map back to top-down and north-up, after navigating */
      fitBounds([west, south, east, north]: Bounds, flat = false) {
        // The fit is made inside the map's own padding, which navigation leaves set
        if (flat) map?.setPadding(NO_PADDING)
        map?.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          {
            padding: paddingAround(overlays),
            maxZoom: 16,
            ...(flat && { pitch: 0, bearing: 0 }),
          },
        )
      },
      /** Turns the map back to top-down and north-up, after navigating. */
      flatten() {
        map?.easeTo({ pitch: 0, bearing: 0, padding: NO_PADDING, duration: 600 })
      },
      /** The part of the map not hidden by the panel, and its middle. */
      visibleArea(): { bounds: Bounds; near: LngLat } | null {
        if (!map) return null
        const padding = paddingAround(overlays)
        const { width, height } = map.getContainer().getBoundingClientRect()
        const southWest = map.unproject([padding.left, height - padding.bottom])
        const northEast = map.unproject([width - padding.right, padding.top])
        const middle = map.unproject([
          (padding.left + width - padding.right) / 2,
          (padding.top + height - padding.bottom) / 2,
        ])
        return {
          bounds: [southWest.lng, southWest.lat, northEast.lng, northEast.lat],
          near: { lng: middle.lng, lat: middle.lat },
        }
      },
      /** Where a point is drawn, in pixels from the map's top left. */
      project(at: LngLat): { x: number; y: number } | null {
        return map?.project([at.lng, at.lat]) ?? null
      },
    }),
    [map, overlays],
  )
}
