import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import {
  BASE_MAPS,
  buildStyle,
  labelExpression,
  OVERLAYS,
  type MapLook,
  type Overlay,
  type TerrainUrls,
} from './mapStyles'

const ORIGIN = 'http://maps.local:7000'
vi.stubGlobal('location', { origin: ORIGIN })

const line = (id: string): LayerSpecification => ({
  id,
  type: 'line',
  source: 'openmaptiles',
  'source-layer': 'transportation',
  paint: { 'line-color': '#123456' },
})
const label = (id: string, sourceLayer: string): LayerSpecification => ({
  id,
  type: 'symbol',
  source: 'openmaptiles',
  'source-layer': sourceLayer,
  layout: { 'text-field': '{name}' },
})

// The shape of TileServer's basic style, cut down: land, water, buildings, roads, then labels
const BASE: StyleSpecification = {
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: `${ORIGIN}/data/v3.json` } },
  glyphs: `${ORIGIN}/fonts/{fontstack}/{range}.pbf`,
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: {} },
    label('housenumber', 'housenumber'),
    { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', paint: {} },
    line('road_minor'),
    line('road_major_case'),
    line('road_major'),
    label('road_label', 'transportation_name'),
    label('place_label', 'place'),
  ],
}
const TERRAIN: TerrainUrls = {
  dem: `${ORIGIN}/terrain/{z}/{x}/{y}.png`,
  contours: 'contour-protocol://{z}/{x}/{y}',
  maxzoom: 12,
}

const look = (
  base: MapLook['base'],
  overlays: Overlay[] = [],
  roadLabels: MapLook['roadLabels'] = 'names',
) => ({
  base,
  overlays,
  roadLabels,
})
const ids = (style: StyleSpecification) => style.layers.map((layer) => layer.id)
const ALL_OVERLAYS = OVERLAYS.map((overlay) => overlay.id)

describe('buildStyle', () => {
  it('leaves the standard map as it is', () => {
    const style = buildStyle(BASE, look('standard'))
    expect(style).toEqual(BASE)
  })

  it('recolours the other maps without adding or losing layers', () => {
    for (const base of ['light', 'dark'] as const) {
      const style = buildStyle(BASE, look(base))
      expect(ids(style)).toEqual(ids(BASE))
      const background = style.layers[0] as { paint: Record<string, unknown> }
      expect(background.paint['background-color']).not.toBe('#fff')
      const roadLabel = style.layers.find((layer) => layer.id === 'road_label') as {
        paint: Record<string, unknown>
      }
      expect(roadLabel.paint['text-color']).toMatch(/^#/)
    }
  })

  it('never changes the style it was given', () => {
    const before = structuredClone(BASE)
    for (const { id } of BASE_MAPS) buildStyle(BASE, look(id, ALL_OVERLAYS, 'numbers'), TERRAIN)
    expect(BASE).toEqual(before)
  })

  it('keeps layer ids unique and every layer on a known source, for every look', () => {
    for (const { id } of BASE_MAPS) {
      for (const roadLabels of ['names', 'numbers'] as const) {
        const style = buildStyle(BASE, look(id, ALL_OVERLAYS, roadLabels), TERRAIN)
        expect(new Set(ids(style)).size).toBe(style.layers.length)
        for (const layer of style.layers) {
          if ('source' in layer) expect(style.sources).toHaveProperty(layer.source as string)
        }
      }
    }
  })

  it('draws overlays over the roads and under the labels after them', () => {
    const order = ids(buildStyle(BASE, look('standard', ['rail', 'oneWay'])))
    expect(order.indexOf('overlay-rail')).toBe(order.indexOf('road_major') + 1)
    expect(order.indexOf('overlay-one-way')).toBeLessThan(order.indexOf('road_label'))
    // House numbers come before the roads, and stay there
    expect(order.indexOf('housenumber')).toBe(2)
  })

  it('only adds the road data source for overlays that use it', () => {
    expect(buildStyle(BASE, look('standard', ['rail'])).sources).not.toHaveProperty('road-data')
    const style = buildStyle(BASE, look('standard', ['speedLimits']))
    expect(style.sources['road-data']).toMatchObject({
      tiles: [`${ORIGIN}/api/road-data/{z}/{x}/{y}.mvt`],
    })
  })

  it('adds hillshading and contours for topo, given terrain', () => {
    const style = buildStyle(BASE, look('topo'), TERRAIN)
    const order = ids(style)
    expect(style.sources).toHaveProperty('terrain-dem')
    expect(style.sources).toHaveProperty('contours')
    expect(order.indexOf('topo-hillshade')).toBe(order.indexOf('building') - 1)
    expect(order.indexOf('topo-contours')).toBeLessThan(order.indexOf('road_minor'))

    // Without terrain built, topo is just the standard map
    expect(buildStyle(BASE, look('topo'))).toEqual(BASE)
  })

  it('labels roads with route numbers when asked', () => {
    const style = buildStyle(BASE, look('standard', [], 'numbers'))
    const layout = (id: string) =>
      (style.layers.find((layer) => layer.id === id) as { layout: Record<string, unknown> }).layout
    const roadLabel = JSON.stringify(layout('road_label')['text-field'])
    expect(roadLabel).toContain('["get","ref"]')
    // Roads without a number keep the layer's own label
    expect(roadLabel).toContain('["to-string",["get","name"]]')
    expect(layout('place_label')['text-field']).toBe('{name}')
  })

  it("turns a layer's label into an expression", () => {
    expect(labelExpression('{name:latin}')).toEqual(['to-string', ['get', 'name:latin']])
    expect(labelExpression('{name:latin} {name:nonlatin}')).toEqual([
      'concat',
      ['to-string', ['get', 'name:latin']],
      ' ',
      ['to-string', ['get', 'name:nonlatin']],
    ])
    expect(labelExpression(['coalesce', ['get', 'name:en'], ['get', 'name']])).toEqual([
      'coalesce',
      ['get', 'name:en'],
      ['get', 'name'],
    ])
    expect(labelExpression(undefined)).toEqual(['get', 'name'])
  })

  // The running stack must make no internet calls: nothing a look adds may point elsewhere
  it('only adds sources served by this site', () => {
    for (const { id } of BASE_MAPS) {
      const style = buildStyle(BASE, look(id, ALL_OVERLAYS), TERRAIN)
      const urls = Object.values(style.sources).flatMap((source) => [
        ...('url' in source && source.url ? [source.url] : []),
        ...('tiles' in source && source.tiles ? source.tiles : []),
      ])
      for (const url of urls) {
        if (/^https?:/.test(url)) expect(new URL(url).origin).toBe(ORIGIN)
      }
    }
  })
})
