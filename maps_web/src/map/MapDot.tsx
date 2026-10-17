import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Marker } from 'maplibre-gl'
import type { LngLat } from '../types'
import { useMap } from './MapContext'
import './MapDot.css'

interface MapDotProps {
  position: LngLat
  /** Another look, alongside the plain dot's `map-dot` class */
  className?: string
  /** Drawn inside the dot, e.g. an icon */
  children?: ReactNode
}

/** A small dot on the map, e.g. the point on a route under the elevation chart's cursor. */
export function MapDot({ position, className, children }: MapDotProps) {
  const map = useMap()
  const markerRef = useRef<Marker | null>(null)
  // Its look is set once: each dot on the map keeps the same one
  const [element] = useState(() => {
    const div = document.createElement('div')
    div.className = className ? `map-dot ${className}` : 'map-dot'
    return div
  })

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

  return children ? createPortal(children, element) : null
}
