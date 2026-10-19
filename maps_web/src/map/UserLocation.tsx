import { useEffect, useState } from 'react'
import { Marker } from 'maplibre-gl'
import type { LngLat } from '../types'
import { along, glide, turn } from './glide'
import { useMap } from './MapContext'
import './UserLocation.css'

/** The "you are here" dot, with a cone pointing the way you're heading. */
export function UserLocation({ at, heading }: { at: LngLat; heading: number }) {
  const map = useMap()
  const [marker] = useState(() => {
    const element = document.createElement('div')
    element.className = 'user-location'
    element.innerHTML =
      '<span class="user-location__cone"></span><span class="user-location__dot"></span>'
    // Turns with the map, so "heading" is a real compass direction. It needs a position
    // before it's added to the map: MapLibre draws it straight away
    return new Marker({ element, rotationAlignment: 'map', pitchAlignment: 'map' })
      .setLngLat([at.lng, at.lat])
      .setRotation(heading)
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
    const fromHeading = marker.getRotation()
    return glide((t) =>
      marker
        .setLngLat([along(from.lng, at.lng, t), along(from.lat, at.lat, t)])
        .setRotation(turn(fromHeading, heading, t)),
    )
  }, [marker, at.lng, at.lat, heading])

  return null
}
