import { planTransit, TransitPlanError, type TransitOptions } from '../api/transit'
import type { Itinerary, LngLat } from '../types'
import { isUnreachable, useFetch, type FetchState } from './useFetch'

export type TransitPlanState = FetchState<Itinerary[]>

const OUTSIDE_AREA = 'One of the points is outside the area public transport covers.'

// OTP's routing error codes
const NO_JOURNEY_MESSAGES: Record<string, string> = {
  NO_TRANSIT_CONNECTION:
    'No public transport connects these places. If you’ve turned modes off, try allowing more.',
  NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW: 'No services around that time. Try another time.',
  OUTSIDE_SERVICE_PERIOD: 'There are no timetables for that date yet.',
  OUTSIDE_BOUNDS: OUTSIDE_AREA,
  LOCATION_NOT_FOUND: OUTSIDE_AREA,
  NO_STOPS_IN_RANGE: 'There are no stops within walking distance.',
  WALKING_BETTER_THAN_TRANSIT: "It's quicker to walk. Choose Walk for directions.",
}

function errorMessage(err: unknown): string {
  if (err instanceof TransitPlanError) return NO_JOURNEY_MESSAGES[err.code] ?? 'No journey found.'
  if (isUnreachable(err)) {
    return "Public transport isn't responding. Check that the OTP container is running and its graph is built."
  }
  return err instanceof Error ? err.message : 'Public transport planning failed.'
}

/** Journey options between two points (null ends skip the request). */
export function useTransitPlan(
  from: LngLat | null,
  to: LngLat | null,
  options: TransitOptions,
): TransitPlanState {
  const key = from && to ? JSON.stringify([from, to, options]) : null
  return useFetch(key, (signal) => planTransit(from!, to!, options, signal), errorMessage)
}
