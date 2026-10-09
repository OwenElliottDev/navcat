import { CAR_AVOIDS, type CarAvoid } from '../config'
import type { LngLat, RoutePath } from '../types'
import { http } from './http'

// Street routing: walk, cycle, drive (GraphHopper)

/** Rules that steer a route away from the things to avoid, for a request's custom model. */
function avoidModel(avoid: CarAvoid[]) {
  return {
    priority: avoid.map((name) => ({
      if: CAR_AVOIDS[name].condition,
      multiply_by: String(CAR_AVOIDS[name].factor),
    })),
  }
}

export async function getRoute(
  from: LngLat,
  to: LngLat,
  profile: string,
  avoid: CarAvoid[],
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
      ...(avoid.length && { custom_model: avoidModel(avoid), 'ch.disable': true }),
    },
    { signal },
  )
  return data.paths[0]
}

export interface RoutingInfo {
  /** Travel modes configured in GraphHopper */
  profiles: string[]
  /** What the routing graph knows about roads (road_class, toll, ...) */
  encodedValues: string[]
}

export async function getRoutingInfo(): Promise<RoutingInfo> {
  const { data } = await http.get<{
    profiles: { name: string }[]
    encoded_values?: Record<string, unknown>
  }>('/info')
  return {
    profiles: data.profiles.map((p) => p.name),
    encodedValues: Object.keys(data.encoded_values ?? {}),
  }
}
