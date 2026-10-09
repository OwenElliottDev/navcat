import type { Approach } from '../utils/lanes'
import { http } from './http'

// Turn lanes from OSM (maps_backend)

/** turn:lanes for each approach, in its direction of travel; null where OSM doesn't say. */
export async function getLanes(
  approaches: Approach[],
  signal?: AbortSignal,
): Promise<(string | null)[]> {
  const { data } = await http.post<(string | null)[]>('/lanes', { approaches }, { signal })
  return data
}
