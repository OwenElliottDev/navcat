import type { Itinerary, LngLat, TransitLeg, TripTime } from '../types'
import { decodePolyline } from '../utils/geo'
import { http } from './http'

// Public transport journeys (OpenTripPlanner's GTFS GraphQL API)

const PLAN_QUERY = `
  query Plan(
    $from: PlanCoordinateInput!
    $to: PlanCoordinateInput!
    $dateTime: PlanDateTimeInput
    $modes: PlanModesInput
  ) {
    planConnection(
      origin: { location: { coordinate: $from } }
      destination: { location: { coordinate: $to } }
      dateTime: $dateTime
      modes: $modes
      first: 5
    ) {
      routingErrors { code }
      edges {
        node {
          start
          end
          duration
          legs {
            mode
            transitLeg
            headsign
            distance
            duration
            start { scheduledTime estimated { time } }
            end { scheduledTime estimated { time } }
            from { name }
            to { name }
            route { shortName longName color textColor }
            legGeometry { points }
            steps { distance relativeDirection absoluteDirection streetName bogusName lat lon exit }
          }
        }
      }
    }
  }
`

/** OTP couldn't plan a journey; `code` says why (e.g. NO_TRANSIT_CONNECTION). */
export class TransitPlanError extends Error {
  code: string

  constructor(code: string) {
    super(`No journey found (${code})`)
    this.code = code
  }
}

// ---------- response shapes ----------

interface OtpTime {
  scheduledTime: string
  estimated: { time: string } | null
}

interface OtpLeg {
  mode: string
  transitLeg: boolean
  headsign: string | null
  distance: number
  duration: number
  start: OtpTime
  end: OtpTime
  from: { name: string | null }
  to: { name: string | null }
  route: {
    shortName: string | null
    longName: string | null
    color: string | null
    textColor: string | null
  } | null
  legGeometry: { points: string } | null
  steps: {
    distance: number
    relativeDirection: string
    absoluteDirection: string | null
    streetName: string | null
    /** The name is made up, e.g. "path" */
    bogusName: boolean | null
    lat: number
    lon: number
    exit: string | null
  }[]
}

interface OtpItinerary {
  start: string
  end: string
  duration: number
  legs: OtpLeg[]
}

interface PlanResponse {
  data?: {
    planConnection: {
      routingErrors: { code: string }[]
      edges: { node: OtpItinerary }[]
    }
  }
  errors?: { message: string }[]
}

// ---------- mapping to our types ----------

/** Live time when there is one, otherwise the timetable. */
const timeOf = (t: OtpTime) => t.estimated?.time ?? t.scheduledTime

const hexColor = (value: string | null) => (value ? `#${value}` : undefined)

function toLeg(leg: OtpLeg): TransitLeg {
  return {
    mode: leg.mode,
    isTransit: leg.transitLeg,
    start: timeOf(leg.start),
    end: timeOf(leg.end),
    duration: leg.duration,
    distance: leg.distance,
    from: leg.from.name ?? '',
    to: leg.to.name ?? '',
    headsign: leg.headsign ?? undefined,
    route: leg.route
      ? {
          name: leg.route.shortName || leg.route.longName || '',
          color: hexColor(leg.route.color),
          textColor: hexColor(leg.route.textColor),
        }
      : undefined,
    geometry: { type: 'LineString', coordinates: decodePolyline(leg.legGeometry?.points ?? '') },
    steps: leg.steps.map((step) => ({
      relativeDirection: step.relativeDirection,
      absoluteDirection: step.absoluteDirection,
      streetName: step.bogusName ? null : step.streetName,
      distance: step.distance,
      at: { lng: step.lon, lat: step.lat },
      exit: step.exit,
    })),
  }
}

export interface TransitOptions {
  /** null to leave now */
  time: TripTime | null
  /** Transit modes the journey may use (e.g. ["TRAM", "BUS"]); null for any */
  modes: string[] | null
}

/** Journey options between two points. */
export async function planTransit(
  from: LngLat,
  to: LngLat,
  { time, modes }: TransitOptions,
  signal?: AbortSignal,
): Promise<Itinerary[]> {
  const at = time && new Date(time.time).toISOString()
  const variables = {
    from: { latitude: from.lat, longitude: from.lng },
    to: { latitude: to.lat, longitude: to.lng },
    ...(time && {
      dateTime: time.type === 'arriveBy' ? { latestArrival: at } : { earliestDeparture: at },
    }),
    ...(modes && { modes: { transit: { transit: modes.map((mode) => ({ mode })) } } }),
  }
  const { data } = await http.post<PlanResponse>(
    '/transit',
    { query: PLAN_QUERY, variables },
    { signal },
  )

  if (!data.data) throw new Error(data.errors?.[0]?.message ?? 'Public transport planning failed.')
  const { edges, routingErrors } = data.data.planConnection
  if (!edges.length) throw new TransitPlanError(routingErrors[0]?.code ?? 'NO_TRANSIT_CONNECTION')

  return edges.map(({ node }) => ({
    start: node.start,
    end: node.end,
    duration: node.duration,
    legs: node.legs.map(toLeg),
  }))
}

/** The transit modes in the timetables, e.g. ["BUS", "COACH", "RAIL", "TRAM"]. */
export async function getTransitModes(): Promise<string[]> {
  const { data } = await http.post<{ data?: { routes: { mode: string }[] } }>('/transit', {
    query: '{ routes { mode } }',
  })
  return [...new Set(data.data?.routes.map((route) => route.mode))]
}
