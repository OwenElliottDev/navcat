import { CAR_AVOIDS, STEEP_HILLS, type CarAvoid } from '../config'
import type { LngLat, RoutePath } from '../types'
import { http } from './http'

// Street routing: walk, cycle, drive (GraphHopper)

export interface RouteOptions {
  /** Things for a drive to avoid */
  avoid?: CarAvoid[]
  /** Steer a walk or ride away from steep hills */
  avoidSteepHills?: boolean
}

/** Rules that steer a route by the options, for a request's custom model (null for none). */
function customModel({ avoid = [], avoidSteepHills }: RouteOptions) {
  const priority = [
    ...avoid.map((name) => ({
      if: CAR_AVOIDS[name].condition,
      multiply_by: String(CAR_AVOIDS[name].factor),
    })),
    ...(avoidSteepHills ? STEEP_HILLS.priority : []),
  ]
  return priority.length ? { priority } : null
}

export async function getRoute(
  from: LngLat,
  to: LngLat,
  profile: string,
  options: RouteOptions = {},
  signal?: AbortSignal,
): Promise<RoutePath> {
  const model = customModel(options)
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
      ...(model && { custom_model: model, 'ch.disable': true }),
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
