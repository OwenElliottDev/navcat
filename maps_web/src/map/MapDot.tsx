import { useEffect, useRef } from 'react'
import { Marker } from 'maplibre-gl'
import { ICON_PATHS } from '../components/iconPaths'
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

  // One marker for as long as the dot is shown; moving it just repositions it
  useEffect(() => {
    if (!map) return
    const element = document.createElement('div')
    element.className = isQuery ? 'map-dot map-dot--query' : 'map-dot'
    if (isQuery) element.append(searchIcon())
    const marker = new Marker({ element })
    markerRef.current = marker
    return () => {
      marker.remove()
      markerRef.current = null
    }
  }, [map, isQuery])

  const { lng, lat } = position
  useEffect(() => {
    const marker = markerRef.current
    if (!map || !marker) return
    marker.setLngLat([lng, lat])
    // Added once: addTo re-adds the element and its listeners every time
    if (!marker.getElement().isConnected) marker.addTo(map)
  }, [map, isQuery, lng, lat])

  return null
}

const SVG = 'http://www.w3.org/2000/svg'

/** The search icon, as the Icon component draws it. */
function searchIcon() {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 20 20')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('d', ICON_PATHS.search)
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '2.2')
  path.setAttribute('stroke-linecap', 'round')
  svg.append(path)
  return svg
}
