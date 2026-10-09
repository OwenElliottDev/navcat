import { getCommunity } from '../api/places'
import type { PlaceRef } from '../types'
import { useFetch, type FetchState } from './useFetch'
import type { Community } from '../types'

export type CommunityState = FetchState<Community>

/** Reviews and photos for a place. Bump `version` to fetch again after a change. */
export function useCommunity(place: PlaceRef | null, version = 0): CommunityState {
  const key = place ? `${place.type}${place.id}@${version}` : null
  return useFetch(
    key,
    (signal) => getCommunity(place!, signal),
    () => 'Couldn’t load reviews.',
  )
}
