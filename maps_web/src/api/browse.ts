import type { Bounds, BrowseResults, Category, LngLat } from '../types'
import { http } from './http'

// Places by category within an area (maps_backend + PostGIS)

export async function getCategories(): Promise<Category[]> {
  const { data } = await http.get<Category[]>('/browse/categories')
  return data
}

export async function browse(
  category: string,
  bounds: Bounds,
  near: LngLat,
  signal?: AbortSignal,
): Promise<BrowseResults> {
  const { data } = await http.get<BrowseResults>('/browse', {
    params: {
      category,
      bbox: bounds.map((n) => n.toFixed(5)).join(','),
      near: `${near.lng.toFixed(5)},${near.lat.toFixed(5)}`,
      limit: 100,
    },
    signal,
  })
  return data
}
