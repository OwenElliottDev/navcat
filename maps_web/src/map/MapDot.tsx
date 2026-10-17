import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Marker } from 'maplibre-gl'
import { Icon } from '../components/icons'
import type { LngLat } from '../types'
import { useMap } from './MapContext'
import './MapDot.css'

interface MapDotProps {
  position: LngLat
  /** A grey dot with a search icon, for the spot "What's here?" looked up. */
  isQuery?: boolean
}

/** A small dot on the map, e.g. the point on a route under the elevation chart's cursor. */
export function MapDot({ position, isQuery = false }: MapDotProps) {
  const map = useMap()
  const markerRef = useRef<Marker | null>(null)
  const element = useMemo(() => {
    const div = document.createElement('div')
    div.className = isQuery ? 'map-dot map-dot--query' : 'map-dot'
    return div
  }, [isQuery])

  // One marker for as long as the dot is shown; moving it just repositions it
  useEffect(() => {
    if (!map) return
    const marker = new Marker({ element })
    markerRef.current = marker
    return () => {
      marker.remove()
      markerRef.current = null
    }
  }, [map, element])

  const { lng, lat } = position
  useEffect(() => {
    const marker = markerRef.current
    if (!map || !marker) return
    marker.setLngLat([lng, lat])
    // Added once: addTo re-adds the element and its listeners every time
    if (!marker.getElement().isConnected) marker.addTo(map)
  }, [map, element, lng, lat])

  return isQuery ? createPortal(<Icon name="search" />, element) : null
}
