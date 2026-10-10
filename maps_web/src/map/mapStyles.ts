import type {
  ExpressionSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl'

/**
 * Map types and overlays, all built from TileServer's one style so they need no extra
 * fonts, sprites or tiles: other looks are recoloured, and topo adds locally built terrain.
 */

export type BaseMap = 'standard' | 'light' | 'dark' | 'topo'
export type Overlay = 'bikePaths' | 'speedLimits' | 'oneWay' | 'unpaved' | 'rail'
/** What roads are labelled with: their names (Hume Highway) or route numbers (M31) */
export type RoadLabels = 'names' | 'numbers'

export interface MapLook {
  base: BaseMap
  overlays: Overlay[]
  roadLabels: RoadLabels
}

export const BASE_MAPS: { id: BaseMap; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'topo', label: 'Topo' },
]

export const ROAD_LABELS: { id: RoadLabels; label: string }[] = [
  { id: 'names', label: 'Names' },
  { id: 'numbers', label: 'Numbers' },
]

export const OVERLAYS: { id: Overlay; label: string; hint?: string }[] = [
  {
    id: 'bikePaths',
    label: 'Bike paths & lanes',
    hint: 'Lanes and cycle routes show when zoomed in',
  },
  { id: 'speedLimits', label: 'Speed limits', hint: 'Zoom in to see' },
  { id: 'oneWay', label: 'One-way streets', hint: 'Zoom in to see' },
  { id: 'unpaved', label: 'Unsealed roads & tracks' },
  { id: 'rail', label: 'Train & tram lines' },
]

/** Overlays drawn from GraphHopper's road data, which only comes at street level */
const ROAD_DATA_OVERLAYS: Overlay[] = ['bikePaths', 'speedLimits']
const ROAD_DATA_MINZOOM = 15

// ---------- recolouring ----------

/** What each layer in the style draws, so a palette can colour it */
type Role =
  | 'background'
  | 'land'
  | 'green'
  | 'water'
  | 'building'
  | 'minorRoad'
  | 'majorRoad'
  | 'roadCase'
  | 'rail'
  | 'boundary'
  | 'label'

function roleOf(layer: LayerSpecification): Role {
  const id = layer.id
  if (layer.type === 'background') return 'background'
  if (layer.type === 'symbol') return 'label'
  if (/water/.test(id)) return 'water'
  if (/grass|wood|park/.test(id)) return 'green'
  if (/building/.test(id)) return 'building'
  if (/case/.test(id)) return 'roadCase'
  if (/rail/.test(id)) return 'rail'
  if (/admin/.test(id)) return 'boundary'
  if (/major|trunk|secondary|motorway|aeroway/.test(id)) return 'majorRoad'
  if (/minor|path|pier|bridge/.test(id)) return 'minorRoad'
  return 'land'
}

/** A colour for each role; for labels, [text, halo] */
type Palette = Record<Exclude<Role, 'label'>, string> & { label: [string, string] }

const PALETTES: Record<Exclude<BaseMap, 'standard' | 'topo'>, Palette> = {
  light: {
    background: '#f3f3f0',
    land: '#ecece8',
    green: '#e2eadb',
    water: '#cddde6',
    building: '#e3e1dc',
    minorRoad: '#ffffff',
    majorRoad: '#ffffff',
    roadCase: '#d9d9d6',
    rail: '#d3d3d0',
    boundary: '#b5b5b2',
    label: ['#666a6d', '#ffffff'],
  },
  dark: {
    background: '#1a1e21',
    land: '#1f2428',
    green: '#1d2a22',
    water: '#0e2231',
    building: '#2a3036',
    minorRoad: '#2e353c',
    majorRoad: '#434c56',
    roadCase: '#14171a',
    rail: '#3a4249',
    boundary: '#55606a',
    label: ['#c4cdd5', '#121518'],
  },
}

function recolour(layer: LayerSpecification, palette: Palette): LayerSpecification {
  const role = roleOf(layer)
  if (role === 'label') {
    const [text, halo] = palette.label
    return {
      ...layer,
      paint: { ...layer.paint, 'text-color': text, 'text-halo-color': halo },
    } as LayerSpecification
  }

  const colour = palette[role]

  switch (layer.type) {
    case 'background':
      return { ...layer, paint: { ...layer.paint, 'background-color': colour } }
    case 'fill':
      return {
        ...layer,
        paint: { ...layer.paint, 'fill-color': colour, 'fill-outline-color': colour },
      }
    case 'line':
      return { ...layer, paint: { ...layer.paint, 'line-color': colour } }
    default:
      return layer
  }
}

// ---------- topo ----------

/** Where the topo map's elevation comes from (set up in terrain.ts) */
export interface TerrainUrls {
  /** Elevation tiles, for hillshading */
  dem: string
  /** Contour line tiles generated from the elevation */
  contours: string
  /** Most detailed zoom the elevation tiles were built to */
  maxzoom: number
}

// Built locally from the SRTM data GraphHopper downloads (public domain)
const TERRAIN_ATTRIBUTION = 'Elevation: SRTM (NASA, USGS)'

const CONTOUR_COLOUR = '#a17c52'

function demSource(terrain: TerrainUrls): SourceSpecification {
  return {
    type: 'raster-dem',
    encoding: 'terrarium',
    tiles: [terrain.dem],
    tileSize: 256,
    maxzoom: terrain.maxzoom,
    attribution: TERRAIN_ATTRIBUTION,
  }
}

function topoSources(terrain: TerrainUrls): StyleSpecification['sources'] {
  return {
    'terrain-dem': demSource(terrain),
    contours: { type: 'vector', tiles: [terrain.contours], maxzoom: 15 },
  }
}

const TERRAIN_3D_SOURCE = 'terrain-3d'
const TERRAIN_EXAGGERATION = 1.5

const HILLSHADE: LayerSpecification = {
  id: 'topo-hillshade',
  type: 'hillshade',
  source: 'terrain-dem',
  paint: {
    'hillshade-exaggeration': 0.35,
    'hillshade-shadow-color': '#4a3e2a',
    'hillshade-highlight-color': '#ffffff',
    'hillshade-accent-color': '#6b5a3e',
  },
}

/** Major lines (level 1) are bolder and labelled with their height */
const CONTOURS: LayerSpecification[] = [
  {
    id: 'topo-contours',
    type: 'line',
    source: 'contours',
    'source-layer': 'contours',
    minzoom: 11,
    paint: {
      'line-color': CONTOUR_COLOUR,
      'line-opacity': ['match', ['get', 'level'], 1, 0.7, 0.4],
      'line-width': ['match', ['get', 'level'], 1, 1.1, 0.6],
    },
  },
  {
    id: 'topo-contour-labels',
    type: 'symbol',
    source: 'contours',
    'source-layer': 'contours',
    minzoom: 11,
    filter: ['>', ['get', 'level'], 0],
    layout: {
      'symbol-placement': 'line',
      'text-field': ['concat', ['number-format', ['get', 'ele'], {}], ' m'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 10,
    },
    paint: {
      'text-color': '#86643f',
      'text-halo-color': 'rgba(255, 255, 255, 0.85)',
      'text-halo-width': 1.2,
    },
  },
]

// ---------- overlays ----------

const zoomWidth = (low: number, high: number): ExpressionSpecification => [
  'interpolate',
  ['linear'],
  ['zoom'],
  10,
  low,
  16,
  high,
]

/** Road data: speed limits, bike lanes and cycle routes (see maps_backend/app/road_data.py) */
const roadDataSource = () => ({
  type: 'vector' as const,
  tiles: [`${location.origin}/api/road-data/{z}/{x}/{y}.mvt`],
  minzoom: ROAD_DATA_MINZOOM,
  // Detailed enough to stretch further in, which saves requests
  maxzoom: 16,
})

const roadData = (
  id: string,
  filter: ExpressionSpecification,
  paint: Record<string, unknown>,
  layout: Record<string, unknown> = { 'line-join': 'round', 'line-cap': 'round' },
  type: 'line' | 'symbol' = 'line',
) =>
  ({
    id,
    type,
    source: 'road-data',
    'source-layer': 'roads',
    minzoom: ROAD_DATA_MINZOOM,
    filter,
    layout,
    paint,
  }) as LayerSpecification

const GREEN = '#1f9d55'

// Slow (green) to fast (red), in km/h
const SPEED_COLOURS: ExpressionSpecification = [
  'step',
  ['get', 'maxspeed'],
  '#2e9e4f',
  31,
  '#7cc243',
  41,
  '#e8c21a',
  51,
  '#f08c1f',
  61,
  '#e5532a',
  81,
  '#b0122b',
]

function overlayLayers(overlay: Overlay): LayerSpecification[] {
  switch (overlay) {
    case 'oneWay':
      return [
        {
          id: 'overlay-one-way',
          type: 'symbol',
          source: 'openmaptiles',
          'source-layer': 'transportation',
          minzoom: 15,
          filter: ['match', ['get', 'oneway'], [1, -1], true, false],
          layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 60,
            // The map's font has no arrows, but it has a chevron
            'text-field': '›',
            'text-font': ['Noto Sans Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 15, 22, 18, 30],
            // Point the way the traffic goes, not the way that reads best
            'text-keep-upright': false,
            'text-rotate': ['match', ['get', 'oneway'], -1, 180, 0],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#3b6db3',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
          },
        },
      ]
    case 'speedLimits':
      return [
        roadData('overlay-speed', ['has', 'maxspeed'], {
          'line-color': SPEED_COLOURS,
          'line-width': ['interpolate', ['linear'], ['zoom'], 15, 3, 18, 6],
          'line-opacity': 0.85,
        }),
        roadData(
          'overlay-speed-labels',
          ['has', 'maxspeed'],
          { 'text-color': '#1c2526', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
          {
            'symbol-placement': 'line',
            'symbol-spacing': 250,
            'text-field': ['to-string', ['get', 'maxspeed']],
            'text-font': ['Noto Sans Regular'],
            'text-size': 11,
          },
          'symbol',
        ),
      ]
    case 'unpaved':
      return [
        {
          id: 'overlay-unpaved',
          type: 'line',
          source: 'openmaptiles',
          'source-layer': 'transportation',
          filter: ['==', ['get', 'surface'], 'unpaved'],
          layout: { 'line-join': 'round' },
          paint: {
            'line-color': '#9b6b3f',
            'line-width': zoomWidth(1, 3.5),
            'line-dasharray': [2, 1.5],
          },
        },
      ]
    case 'bikePaths':
      return [
        // Signed cycle routes: a soft glow under everything else
        roadData('overlay-bike-routes', ['has', 'bike_route'], {
          'line-color': GREEN,
          'line-width': ['interpolate', ['linear'], ['zoom'], 15, 8, 18, 16],
          'line-opacity': 0.2,
        }),
        roadData('overlay-bike-lanes', ['==', ['get', 'cycleway'], 'lane'], {
          'line-color': GREEN,
          'line-width': ['interpolate', ['linear'], ['zoom'], 15, 2.5, 18, 5],
        }),
        // Shared lanes and shoulders: dashed, as there's no lane of your own
        roadData(
          'overlay-bike-shared',
          ['match', ['get', 'cycleway'], ['shared_lane', 'shoulder'], true, false],
          {
            'line-color': GREEN,
            'line-width': ['interpolate', ['linear'], ['zoom'], 15, 2, 18, 4],
            'line-dasharray': [2, 2],
          },
          { 'line-join': 'round' },
        ),
        {
          id: 'overlay-bike-paths',
          type: 'line',
          source: 'openmaptiles',
          'source-layer': 'transportation',
          filter: [
            'all',
            ['==', ['get', 'class'], 'path'],
            [
              'any',
              ['==', ['get', 'subclass'], 'cycleway'],
              ['==', ['get', 'bicycle'], 'designated'],
            ],
          ],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#0b6e3a', 'line-width': zoomWidth(1.2, 4) },
        },
        // Protected tracks beside roads (paths themselves are drawn above, from the map tiles)
        roadData('overlay-bike-tracks', ['==', ['get', 'cycleway'], 'track'], {
          'line-color': '#0b6e3a',
          'line-width': ['interpolate', ['linear'], ['zoom'], 15, 3, 18, 6],
        }),
      ]
    case 'rail':
      return [
        {
          id: 'overlay-rail',
          type: 'line',
          source: 'openmaptiles',
          'source-layer': 'transportation',
          filter: ['match', ['get', 'class'], ['rail', 'transit'], true, false],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            // Trams green, trains blue, as on most Australian network maps
            'line-color': ['match', ['get', 'subclass'], 'tram', '#5ba829', '#1f6fd1'],
            'line-width': zoomWidth(1.5, 4.5),
          },
        },
      ]
  }
}

// ---------- road labels ----------

/** A layer's own label as an expression; token strings like "{name:latin}" become one. */
export function labelExpression(textField: unknown): ExpressionSpecification {
  if (Array.isArray(textField)) return textField as ExpressionSpecification
  if (typeof textField !== 'string') return ['get', 'name']
  const parts = textField
    .split(/(\{[^}]+\})/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('{') && part.endsWith('}') ? ['to-string', ['get', part.slice(1, -1)]] : part,
    ) as ExpressionSpecification[]
  return parts.length === 1 && typeof parts[0] !== 'string' ? parts[0] : ['concat', ...parts]
}

/**
 * A road's route number, or the layer's own label if it has none. Only the first of "A60;35" is
 * shown.
 */
function routeNumber(label: ExpressionSpecification): ExpressionSpecification {
  return [
    'let',
    'ref',
    ['to-string', ['get', 'ref']],
    'cut',
    ['index-of', ';', ['to-string', ['get', 'ref']]],
    [
      'case',
      ['==', ['var', 'ref'], ''],
      label,
      ['>', ['var', 'cut'], 0],
      ['slice', ['var', 'ref'], 0, ['var', 'cut']],
      ['var', 'ref'],
    ],
  ]
}

function labelRoadsWithNumbers(layer: LayerSpecification): LayerSpecification {
  if (layer.type !== 'symbol' || layer['source-layer'] !== 'transportation_name') return layer
  const label = labelExpression(layer.layout?.['text-field'])
  return { ...layer, layout: { ...layer.layout, 'text-field': routeNumber(label) } }
}

// ---------- putting it together ----------

export function buildStyle(
  base: StyleSpecification,
  look: MapLook,
  /** Needed for the topo map */
  terrain?: TerrainUrls,
  tilted = false,
): StyleSpecification {
  const palette = look.base === 'standard' || look.base === 'topo' ? null : PALETTES[look.base]
  let layers = palette ? base.layers.map((layer) => recolour(layer, palette)) : [...base.layers]
  if (look.roadLabels === 'numbers') layers = layers.map(labelRoadsWithNumbers)
  let sources = base.sources

  if (look.base === 'topo' && terrain) {
    sources = { ...sources, ...topoSources(terrain) }
    // Shading over the land and water, under buildings and roads
    const firstAboveLand = layers.findIndex((layer) => /building|road|tunnel|bridge/.test(layer.id))
    layers.splice(firstAboveLand === -1 ? layers.length : firstAboveLand, 0, HILLSHADE)
  }

  // Overlays go over the roads (the last thing that isn't a label) but under the labels after
  // them, so names stay readable. Some labels (house numbers) come before the roads.
  const lastShape = layers.findLastIndex((layer) => layer.type !== 'symbol')
  layers.splice(lastShape + 1, 0, ...look.overlays.flatMap(overlayLayers))

  // Contours go under the roads, with the first labels
  if (look.base === 'topo' && terrain) {
    const firstLabel = layers.findIndex((layer) => layer.type === 'symbol')
    layers.splice(firstLabel === -1 ? layers.length : firstLabel, 0, ...CONTOURS)
  }

  if (look.overlays.some((overlay) => ROAD_DATA_OVERLAYS.includes(overlay))) {
    sources = { ...sources, 'road-data': roadDataSource() }
  }

  if (look.base === 'topo' && terrain && tilted) {
    sources = { ...sources, [TERRAIN_3D_SOURCE]: demSource(terrain) }
    return {
      ...base,
      sources,
      layers,
      terrain: { source: TERRAIN_3D_SOURCE, exaggeration: TERRAIN_EXAGGERATION },
    }
  }

  return { ...base, sources, layers }
}
