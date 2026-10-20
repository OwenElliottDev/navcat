import { useEffect, useState } from 'react'
import { Marker } from 'maplibre-gl'
import type { LngLat } from '../types'
import { useMap } from './MapContext'
import './UserLocation.css'

/** "You are here": an arrow pointing the way you're facing, or a dot when that isn't known. */
export function UserLocation({ at, heading }: { at: LngLat; heading: number | null }) {
  const map = useMap()
  const [marker] = useState(() => {
    const element = document.createElement('div')
    element.className = 'user-location'
    element.innerHTML =
      '<svg class="user-location__arrow" viewBox="0 0 32 32" aria-hidden="true">' +
      '<path d="M16 3 27 28 16 22.5 5 28Z" /></svg>' +
      '<span class="user-location__dot"></span>'
    // Turns with the map, so "heading" is a real compass direction. It needs a position
    // before it's added to the map: MapLibre draws it straight away
    return new Marker({ element, rotationAlignment: 'map', pitchAlignment: 'map' })
      .setLngLat([at.lng, at.lat])
      .setRotation(heading ?? 0)
  })

  useEffect(() => {
    if (!map) return
    marker.addTo(map)
    return () => {
      marker.remove()
    }
  }, [map, marker])

  useEffect(() => {
    marker.setLngLat([at.lng, at.lat]).setRotation(heading ?? 0)
    marker.getElement().classList.toggle('user-location--heading', heading !== null)
  }, [marker, at.lng, at.lat, heading])

  return null
}
