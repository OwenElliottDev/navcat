import axios from 'axios'
import { browse } from '../api/browse'
import type { Bounds, BrowseResults, Category, LngLat } from '../types'
import { isUnreachable, useFetch, type FetchState } from './useFetch'

export type BrowseState = FetchState<BrowseResults>

export interface BrowseSearch {
  category: Category
  bounds: Bounds
  /** Results are sorted by distance from here */
  near: LngLat
}

function errorMessage(err: unknown): string {
  if (isUnreachable(err))
    return "Browse isn't responding. Check that the backend container is running."
  const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
  return typeof detail === 'string' ? detail : 'Browse failed.'
}

/** Places in a category inside an area (null skips the request). */
export function useBrowse(search: BrowseSearch | null): BrowseState {
  const key = search ? JSON.stringify([search.category.id, search.bounds, search.near]) : null
  return useFetch(
    key,
    (signal) => browse(search!.category.id, search!.bounds, search!.near, signal),
    errorMessage,
  )
}
