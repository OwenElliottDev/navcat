import { useContext, useEffect, useRef } from 'react'
import { GeolocateControl, Map, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { INITIAL_BOUNDS, MAP_STYLE_URL } from '../config'
import { MapContext } from './MapContext'
import { addPoiLayers } from './poiLayers'
import { addRouteLayers } from './routeLayers'

// MapLibre finds its worker at runtime, which Vite can't see, so bundle it ourselves
setWorkerUrl(workerUrl)

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { setMap } = useContext(MapContext)

  useEffect(() => {
    const map = new Map({
      container: containerRef.current!,
      style: MAP_STYLE_URL,
      bounds: INITIAL_BOUNDS,
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: true },
    })
    map.addControl(new NavigationControl(), 'top-right')
    map.addControl(new ScaleControl(), 'bottom-right')
    if (window.isSecureContext) {
      // Browsers only allow location access over HTTPS (or on localhost)
      map.addControl(
        new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
        'top-right',
      )
    }

    map.on('load', () => {
      addRouteLayers(map)
      addPoiLayers(map)
      setMap(map)
    })

    return () => {
      setMap(null)
      map.remove()
    }
  }, [setMap])

  return <div ref={containerRef} className="map" aria-label="Map" />
}
