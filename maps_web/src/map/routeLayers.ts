import type { ExpressionSpecification, GeoJSONSource, Map } from 'maplibre-gl'
import type { RouteSegment } from '../types'

export const ROUTE_SOURCE_ID = 'route'
const IS_WALKING: ExpressionSpecification = ['==', ['get', 'walking'], true]
const IS_RIDING: ExpressionSpecification = ['==', ['get', 'walking'], false]

/** Solid coloured lines for rides and roads, dots for walking between stops. */
export function addRouteLayers(map: Map) {
  map.addSource(ROUTE_SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: 'route-casing',
    type: 'line',
    source: ROUTE_SOURCE_ID,
    filter: IS_RIDING,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, 5, 14, 12],
    },
  })
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: ROUTE_SOURCE_ID,
    filter: IS_RIDING,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 14, 7],
    },
  })
  map.addLayer({
    id: 'route-walk',
    type: 'line',
    source: ROUTE_SOURCE_ID,
    filter: IS_WALKING,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 14, 6],
      // Zero-length dashes with round caps draw as dots
      'line-dasharray': [0, 2],
    },
  })
}

export function setRouteSegments(map: Map, segments: RouteSegment[]) {
  map.getSource<GeoJSONSource>(ROUTE_SOURCE_ID)?.setData({
    type: 'FeatureCollection',
    features: segments.map((segment) => ({
      type: 'Feature',
      geometry: segment.geometry,
      properties: { color: segment.color, walking: Boolean(segment.walking) },
    })),
  })
}
