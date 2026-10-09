import type { LngLat, PhotonFeature } from '../types'
import { distanceInMetres } from '../utils/geo'
import { placePosition } from '../utils/places'
import { http } from './http'

// Search and reverse geocoding (Photon)

interface FeatureCollection {
  features?: PhotonFeature[]
}

export async function searchPlaces(
  query: string,
  near: LngLat | null,
  limit = 6,
  signal?: AbortSignal,
): Promise<PhotonFeature[]> {
  const bias = near ? { lat: near.lat.toFixed(4), lon: near.lng.toFixed(4) } : {}
  const { data } = await http.get<FeatureCollection>('/search', {
    params: { q: query, limit, ...bias },
    signal,
  })
  return data.features ?? []
}

/** The place at a point, or null if there's nothing there (or search is down). */
export async function reverseGeocode(at: LngLat): Promise<PhotonFeature | null> {
  try {
    const { data } = await http.get<FeatureCollection>('/reverse', {
      params: { lat: at.lat, lon: at.lng },
    })
    return data.features?.[0] ?? null
  } catch {
    return null
  }
}

/** Finds the search result for a named map feature, e.g. a business clicked on the map. */
export async function findNearbyPlace(name: string, near: LngLat): Promise<PhotonFeature | null> {
  try {
    const results = await searchPlaces(name, near, 3)
    return results.find((f) => distanceInMetres(near, placePosition(f)) < 250) ?? null
  } catch {
    return null
  }
}
