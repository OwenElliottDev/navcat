import { useEffect, useState } from 'react'
import { Marker } from 'maplibre-gl'
import type { LngLat } from '../types'
import { along, glide, turn } from './glide'
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

  // Glides to each new fix in step with the follow camera, rather than jumping
  useEffect(() => {
    const from = marker.getLngLat()
    return glide((t) => marker.setLngLat([along(from.lng, at.lng, t), along(from.lat, at.lat, t)]))
  }, [marker, at.lng, at.lat])

  // Turns separately, so a turn of the phone doesn't restart the glide to the fix. With no
  // heading the dot shows, so it keeps the way it last pointed
  useEffect(() => {
    marker.getElement().classList.toggle('user-location--heading', heading !== null)
    if (heading === null) return
    const from = marker.getRotation()
    return glide((t) => marker.setRotation(turn(from, heading, t)))
  }, [marker, heading])

  return null
}
