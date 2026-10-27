import { http } from './http'

// What this stack can plan (maps_backend's /capabilities, from GraphHopper and OpenTripPlanner)

/** A GraphHopper custom model priority rule, e.g. { if: 'toll == ALL', multiply_by: '0.1' } */
export type RouteRule = Record<string, string>

export interface AvoidOption {
  id: string
  /** The travel modes it's for */
  profiles: string[]
  priority: RouteRule[]
}

export interface Capabilities {
  /** null while GraphHopper isn't answering */
  routing: {
    area: [number, number, number, number] | null
    /** GraphHopper's travel modes */
    profiles: string[]
    /** What a drive can avoid here */
    avoid: AvoidOption[]
    /** For walks and rides, when the routing graph knows how steep roads are */
    steepHills: { profiles: string[]; priority: RouteRule[] } | null
  } | null
  /** null while OpenTripPlanner isn't answering */
  transit: {
    modes: string[]
    timetablesFrom: string | null
    timetablesUntil: string | null
  } | null
}

export async function getCapabilities(): Promise<Capabilities> {
  const { data } = await http.get<Capabilities>('/capabilities')
  return data
}
