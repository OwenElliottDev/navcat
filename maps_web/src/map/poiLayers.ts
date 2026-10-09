import type { GeoJSONSource, Map } from 'maplibre-gl'
import { COLORS } from '../config'
import type { Poi } from '../types'

export const POI_SOURCE_ID = 'browse'
export const POI_LAYER_ID = 'browse-pois'

/** Unique id for a POI, used to match map clicks back to results. */
export const poiKey = (poi: Pick<Poi, 'osmType' | 'osmId'>) => `${poi.osmType}${poi.osmId}`

/** Browse results as dots: one GeoJSON layer is far lighter than a DOM marker per result. */
export function addPoiLayers(map: Map) {
  map.addSource(POI_SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: POI_LAYER_ID,
    type: 'circle',
    source: POI_SOURCE_ID,
    paint: {
      'circle-color': COLORS.route,
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10,
        ['case', ['get', 'selected'], 6, 3],
        16,
        ['case', ['get', 'selected'], 11, 7],
      ],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': ['case', ['get', 'selected'], 3, 1.5],
    },
  })
}

export function setPois(map: Map, pois: Poi[], selectedKey: string | null) {
  map.getSource<GeoJSONSource>(POI_SOURCE_ID)?.setData({
    type: 'FeatureCollection',
    features: pois.map((poi) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [poi.lng, poi.lat] },
      properties: { key: poiKey(poi), selected: poiKey(poi) === selectedKey },
    })),
  })
}
