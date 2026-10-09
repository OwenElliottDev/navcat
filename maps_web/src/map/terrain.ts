import mlcontour from 'maplibre-contour'
import { addProtocol } from 'maplibre-gl'
import type { TerrainUrls } from './mapStyles'
import type { TerrainInfo } from './useTerrainInfo'

let urls: TerrainUrls | null = null
let builtFrom: string | undefined

/**
 * Sets up the elevation tiles behind the topo map (once) and returns the URLs its style
 * uses. The tiles are built locally by the terrain-build job and served by nginx.
 * Hillshading and contours share them, decoded in a background worker so drawing
 * contours doesn't make panning stutter.
 */
export function terrainUrls({ maxzoom, source }: TerrainInfo): TerrainUrls {
  if (urls && builtFrom === source) return urls
  builtFrom = source

  // The build's fingerprint in the URL means a rebuild is never hidden by browser caches
  const version = source ? `?v=${source.slice(0, 12)}` : ''
  const dem = new mlcontour.DemSource({
    url: `${location.origin}/terrain/{z}/{x}/{y}.png${version}`,
    encoding: 'terrarium',
    maxzoom,
    worker: true,
  })
  addProtocol(dem.sharedDemProtocolId, dem.sharedDemProtocolV4)
  addProtocol(dem.contourProtocolId, dem.contourProtocolV4)

  urls = {
    dem: dem.sharedDemProtocolUrl,
    contours: dem.contourProtocolUrl({
      // [minor, major] spacing in metres by zoom: finer lines as you zoom in
      thresholds: { 11: [200, 1000], 12: [100, 500], 13: [50, 250], 14: [20, 100] },
      elevationKey: 'ele',
      levelKey: 'level',
      contourLayer: 'contours',
    }),
    maxzoom,
  }
  return urls
}
