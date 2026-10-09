import { useEffect, useRef } from 'react'
import type { MapMouseEvent, MapTouchEvent, PointLike } from 'maplibre-gl'
import type { LngLat } from '../types'
import { useMap } from './MapContext'
import { POI_LAYER_ID } from './poiLayers'

const LONG_PRESS_MS = 550

export interface MapPoi {
  name: string
  kind?: string
  position: LngLat
}

interface Handlers {
  /** One of the browse result dots was clicked. */
  onResultClick: (key: string) => void
  /** A named business or landmark on the map was clicked. */
  onPoiClick: (poi: MapPoi) => void
  /** Right-click, or long-press on touch screens. */
  onContextMenu: (screen: { x: number; y: number }, at: LngLat) => void
  /** The map was clicked or moved, so any open menu should close. */
  onDismiss: () => void
}

export function useMapInteractions(handlers: Handlers) {
  const map = useMap()

  // Always call the latest handlers without re-binding map events
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    if (!map) return

    const poiLayers = map
      .getStyle()
      .layers.filter((layer) => 'source-layer' in layer && layer['source-layer'] === 'poi')
      .map((layer) => layer.id)

    const namedPoiAt = (point: PointLike) =>
      poiLayers.length
        ? map.queryRenderedFeatures(point, { layers: poiLayers }).find((f) => f.properties.name)
        : undefined

    const resultAt = (point: PointLike) =>
      map.queryRenderedFeatures(point, { layers: [POI_LAYER_ID] })[0]

    const onMouseMove = (e: MapMouseEvent) => {
      map.getCanvas().style.cursor = resultAt(e.point) || namedPoiAt(e.point) ? 'pointer' : ''
    }

    const onClick = (e: MapMouseEvent) => {
      handlersRef.current.onDismiss()
      const result = resultAt(e.point)
      if (result) {
        handlersRef.current.onResultClick(String(result.properties.key))
        return
      }
      const poi = namedPoiAt(e.point)
      if (poi?.geometry.type !== 'Point') return
      const [lng, lat] = poi.geometry.coordinates
      handlersRef.current.onPoiClick({
        name: String(poi.properties.name),
        kind: poi.properties.subclass ?? poi.properties.class,
        position: { lng, lat },
      })
    }

    const openMenu = (e: MapMouseEvent | MapTouchEvent) =>
      handlersRef.current.onContextMenu(
        { x: e.point.x, y: e.point.y },
        { lng: e.lngLat.lng, lat: e.lngLat.lat },
      )

    const onContextMenu = (e: MapMouseEvent) => {
      e.preventDefault()
      openMenu(e)
    }

    let pressTimer: number | undefined
    const onTouchStart = (e: MapTouchEvent) => {
      if (e.originalEvent.touches.length === 1) {
        pressTimer = window.setTimeout(() => openMenu(e), LONG_PRESS_MS)
      }
    }
    const cancelPress = () => window.clearTimeout(pressTimer)
    const onMoveStart = () => {
      cancelPress()
      handlersRef.current.onDismiss()
    }

    map.on('mousemove', onMouseMove)
    map.on('click', onClick)
    map.on('contextmenu', onContextMenu)
    map.on('touchstart', onTouchStart)
    map.on('touchend', cancelPress)
    map.on('touchmove', cancelPress)
    map.on('movestart', onMoveStart)

    return () => {
      cancelPress()
      map.off('mousemove', onMouseMove)
      map.off('click', onClick)
      map.off('contextmenu', onContextMenu)
      map.off('touchstart', onTouchStart)
      map.off('touchend', cancelPress)
      map.off('touchmove', cancelPress)
      map.off('movestart', onMoveStart)
    }
  }, [map])
}
