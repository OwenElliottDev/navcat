import { getPlace } from '../api/places'
import type { PlaceRef, PoiDetails } from '../types'
import { useFetch } from './useFetch'

/**
 * A place's full details, with people's corrections. Search results only carry a few tags,
 * so this fills in hours, phone and so on. Bump `version` to fetch again after an edit.
 * Null while loading, and for things that aren't places (streets, suburbs).
 */
export function usePlaceDetails(place: PlaceRef | null, version = 0): PoiDetails | null {
  const key = place ? `${place.type}${place.id}@${version}` : null
  const details = useFetch(
    key,
    (signal) => getPlace(place!, signal),
    () => '',
  )
  return details.status === 'ready' ? details.data : null
}
