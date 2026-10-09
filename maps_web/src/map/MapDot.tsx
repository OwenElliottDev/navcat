import { useEffect, useRef } from 'react'
import { Marker } from 'maplibre-gl'
import type { LngLat } from '../types'
import { useMap } from './MapContext'
import './MapDot.css'

/** A small dot on the map, e.g. the point on a route under the elevation chart's cursor. */
export function MapDot({ position }: { position: LngLat }) {
  const map = useMap()
  const markerRef = useRef<Marker | null>(null)

  // One marker for as long as the dot is shown; moving it just repositions it
  useEffect(() => {
    if (!map) return
    const element = document.createElement('div')
    element.className = 'map-dot'
    const marker = new Marker({ element })
    markerRef.current = marker
    return () => {
      marker.remove()
      markerRef.current = null
    }
  }, [map])

  const { lng, lat } = position
  useEffect(() => {
    const marker = markerRef.current
    if (!map || !marker) return
    marker.setLngLat([lng, lat])
    // Added once: addTo re-adds the element and its listeners every time
    if (!marker.getElement().isConnected) marker.addTo(map)
  }, [map, lng, lat])

  return null
}
