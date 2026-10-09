import { useEffect, useRef } from 'react'
import { Marker } from 'maplibre-gl'
import type { LngLat } from '../types'
import { useMap } from './MapContext'

interface MapMarkerProps {
  position: LngLat
  color: string
  /** Makes the marker draggable; called with where it was dropped. */
  onDragEnd?: (position: LngLat) => void
}

export function MapMarker({ position, color, onDragEnd }: MapMarkerProps) {
  const map = useMap()
  const draggable = Boolean(onDragEnd)

  // Keep the latest callback without recreating the marker when it changes
  const onDragEndRef = useRef(onDragEnd)
  useEffect(() => {
    onDragEndRef.current = onDragEnd
  })

  const { lng, lat } = position
  useEffect(() => {
    if (!map) return
    const marker = new Marker({ color, draggable }).setLngLat([lng, lat]).addTo(map)
    marker.on('dragend', () => {
      const dropped = marker.getLngLat()
      onDragEndRef.current?.({ lng: dropped.lng, lat: dropped.lat })
    })
    return () => {
      marker.remove()
    }
  }, [map, color, draggable, lng, lat])

  return null
}
