import { useEffect, useState } from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import { MAP_STYLE_URL } from '../config'
import { useMap } from './MapContext'
import { buildStyle, type MapLook } from './mapStyles'
import { POI_SOURCE_ID } from './poiLayers'
import { terrainUrls } from './terrain'
import type { TerrainInfo } from './useTerrainInfo'
import { ROUTE_SOURCE_ID } from './routeLayers'

const APP_SOURCES = [ROUTE_SOURCE_ID, POI_SOURCE_ID]

/** Carries the app's own sources and layers (the route, browse dots) into the new style. */
function keepAppLayers(
  previous: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification {
  if (!previous) return next
  const sources = Object.fromEntries(
    APP_SOURCES.filter((id) => previous.sources[id]).map((id) => [id, previous.sources[id]]),
  )
  const layers = previous.layers.filter(
    (layer) => 'source' in layer && APP_SOURCES.includes(layer.source),
  )
  return { ...next, sources: { ...next.sources, ...sources }, layers: [...next.layers, ...layers] }
}

/** Applies a map type and overlays, keeping whatever the app has drawn. `look` should be state. */
export function useMapLook(look: MapLook, terrain: TerrainInfo | null, isTilted: boolean) {
  const map = useMap()
  const [baseStyle, setBaseStyle] = useState<StyleSpecification | null>(null)

  useEffect(() => {
    fetch(MAP_STYLE_URL)
      .then((response) => response.json())
      .then(setBaseStyle)
      .catch(() => {
        // Keep the style the map loaded with
      })
  }, [])

  useEffect(() => {
    if (!map || !baseStyle) return
    // Elevation is only set up once someone picks the topo map (and it's been built)
    const terrainSource = look.base === 'topo' && terrain ? terrainUrls(terrain) : undefined
    // diff: only the layers that changed are touched, so switching is quick
    map.setStyle(buildStyle(baseStyle, look, terrainSource, isTilted), {
      diff: true,
      transformStyle: keepAppLayers,
    })
  }, [map, baseStyle, look, terrain, isTilted])
}
