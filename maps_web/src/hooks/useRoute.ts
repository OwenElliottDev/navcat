import axios from 'axios'
import { getRoute } from '../api/routing'
import type { CarAvoid } from '../config'
import type { LngLat, RoutePath } from '../types'
import { isUnreachable, useFetch, type FetchState } from './useFetch'

export type RouteState = FetchState<RoutePath>

function errorMessage(err: unknown): string {
  if (isUnreachable(err))
    return "Routing isn't responding. Check that the GraphHopper container is running."

  const message: string | undefined = axios.isAxiosError(err)
    ? err.response?.data?.message
    : undefined
  if (message && /Cannot find point/i.test(message)) {
    return "One of the points isn't near a road this travel mode can use. Move the pin closer to a road."
  }
  return message ?? 'Routing failed.'
}

/**
 * A walking, cycling or driving route between two points (null ends skip the request), steering
 * clear of `avoid` if it's given.
 */
export function useRoute(
  from: LngLat | null,
  to: LngLat | null,
  profile: string,
  avoid: CarAvoid[] = [],
): RouteState {
  const key = from && to ? JSON.stringify([profile, from, to, avoid]) : null
  return useFetch(key, (signal) => getRoute(from!, to!, profile, avoid, signal), errorMessage)
}
