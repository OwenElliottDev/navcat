import type { LngLat, RoutePath } from '../types'
import type { RouteRule } from './capabilities'
import { http } from './http'

// Street routing: walk, cycle, drive (GraphHopper)

export async function getRoute(
  from: LngLat,
  to: LngLat,
  profile: string,
  /** Rules steering the route (things to avoid, steep hills) from /api/capabilities */
  priority: RouteRule[] = [],
  signal?: AbortSignal,
): Promise<RoutePath> {
  const { data } = await http.post<{ paths: RoutePath[] }>(
    '/route',
    {
      profile,
      points: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
      points_encoded: false,
      instructions: true,
      elevation: true,
      locale: 'en',
      // Which OSM road each stretch is on, to look up turn lanes
      details: ['osm_way_id'],
      // A custom model can't use the fast (CH) car routing; GraphHopper falls back to LM
      ...(priority.length ? { custom_model: { priority }, 'ch.disable': true } : {}),
    },
    { signal },
  )
  return data.paths[0]
}
