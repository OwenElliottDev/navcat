import { useContext, useEffect, useRef } from 'react'
import { GeolocateControl, Map, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { INITIAL_BOUNDS, MAP_STYLE_URL } from '../config'
import { linkedView } from '../linkedView'
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
      // At a shared link's view if there is one
      ...(linkedView
        ? { center: [linkedView.center.lng, linkedView.center.lat], zoom: linkedView.zoom }
        : { bounds: INITIAL_BOUNDS, fitBoundsOptions: { padding: 20 } }),
      attributionControl: { compact: true },
      // Labels appear without fading in: each fade redraws the map every frame, and while
      // navigating the camera moves often enough that one is always running (battery drain)
      fadeDuration: 0,
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

    // MapLibre opens the compact attribution until the first drag; start it collapsed
    const collapseAttribution = () => {
      const attribution = map.getContainer().querySelector('.maplibregl-compact-show')
      if (!attribution) return
      attribution.classList.remove('maplibregl-compact-show')
      map.off('data', collapseAttribution)
    }
    map.on('data', collapseAttribution)

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
