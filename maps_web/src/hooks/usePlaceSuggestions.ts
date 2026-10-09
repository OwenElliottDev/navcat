import { useEffect, useState } from 'react'
import axios from 'axios'
import { searchExtraPlaces } from '../api/places'
import { searchPlaces } from '../api/search'
import { useMap } from '../map/MapContext'
import type { PhotonFeature } from '../types'
import { poiToPlace } from '../utils/places'

const MIN_LENGTH = 2
const DEBOUNCE_MS = 200

export interface Suggestions {
  results: PhotonFeature[]
  failed: boolean
}

interface Response extends Suggestions {
  query: string
}

/**
 * Autocomplete results for `query`, biased towards the middle of the map: places people
 * added here and places from Overture Maps first, then Photon's (OSM). Returns null while there's nothing to show yet.
 */
export function usePlaceSuggestions(query: string): Suggestions | null {
  const map = useMap()
  const [response, setResponse] = useState<Response | null>(null)
  const trimmed = query.trim()

  useEffect(() => {
    if (trimmed.length < MIN_LENGTH) return

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      const center = map?.getCenter() ?? null
      try {
        const [extra, found] = await Promise.all([
          // These are a bonus: search still works if the backend is down
          searchExtraPlaces(trimmed, center, controller.signal).catch((err) => {
            if (axios.isCancel(err)) throw err
            return []
          }),
          searchPlaces(trimmed, center, 6, controller.signal),
        ])
        setResponse({
          query: trimmed,
          results: [...extra.map(poiToPlace), ...found],
          failed: false,
        })
      } catch (err) {
        if (!axios.isCancel(err)) setResponse({ query: trimmed, results: [], failed: true })
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, map])

  // Only show results that answer the current query
  if (trimmed.length < MIN_LENGTH || response?.query !== trimmed) return null
  return response
}
