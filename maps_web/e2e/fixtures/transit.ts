import { encodePolyline } from './polyline'

// OpenTripPlanner's GTFS GraphQL API: the modes in the timetables, and journeys from
// Flinders Street to Queen Victoria Market by tram or by train.

export const TRANSIT_MODES = {
  data: { routes: ['TRAM', 'BUS', 'RAIL', 'TRAM'].map((mode) => ({ mode })) },
}

const time = (clock: string) => ({ scheduledTime: `2026-10-12T${clock}:00+11:00`, estimated: null })

function walk(
  from: string,
  to: string,
  start: string,
  end: string,
  points: [number, number][],
  distance: number,
  steps: object[],
) {
  return {
    mode: 'WALK',
    transitLeg: false,
    headsign: null,
    distance,
    duration: (Date.parse(`2026-10-12T${end}:00Z`) - Date.parse(`2026-10-12T${start}:00Z`)) / 1000,
    start: time(start),
    end: time(end),
    from: { name: from },
    to: { name: to },
    route: null,
    legGeometry: { points: encodePolyline(points) },
    steps,
  }
}

function ride(
  mode: string,
  route: { shortName: string | null; longName: string; color: string; textColor: string },
  headsign: string,
  from: string,
  to: string,
  start: string,
  end: string,
  points: [number, number][],
  distance: number,
) {
  return {
    mode,
    transitLeg: true,
    headsign,
    distance,
    duration: (Date.parse(`2026-10-12T${end}:00Z`) - Date.parse(`2026-10-12T${start}:00Z`)) / 1000,
    start: time(start),
    end: time(end),
    from: { name: from },
    to: { name: to },
    route,
    legGeometry: { points: encodePolyline(points) },
    steps: [],
  }
}

const step = (
  relativeDirection: string,
  streetName: string | null,
  [lon, lat]: [number, number],
  distance: number,
  absoluteDirection: string | null = null,
) => ({
  distance,
  relativeDirection,
  absoluteDirection,
  streetName,
  bogusName: streetName === null,
  lat,
  lon,
  exit: null,
})

const TRAM_ITINERARY = {
  start: '2026-10-12T08:05:00+11:00',
  end: '2026-10-12T08:24:00+11:00',
  duration: 19 * 60,
  legs: [
    walk(
      'Origin',
      'Flinders St/Elizabeth St #1',
      '08:05',
      '08:09',
      [
        [144.96706, -37.81827],
        [144.9653, -37.81776],
        [144.9644, -37.8175],
      ],
      260,
      [
        step('DEPART', 'Flinders Street', [144.96706, -37.81827], 200, 'WEST'),
        step('RIGHT', 'Elizabeth Street', [144.9644, -37.8175], 60),
      ],
    ),
    ride(
      'TRAM',
      {
        shortName: '19',
        longName: 'North Coburg - Flinders Street Station',
        color: '8A1B61',
        textColor: 'FFFFFF',
      },
      'North Coburg',
      'Flinders St/Elizabeth St #1',
      'Queen Victoria Market/Elizabeth St #7',
      '08:10',
      '08:20',
      [
        [144.9644, -37.8175],
        [144.9629, -37.8146],
        [144.9614, -37.8117],
        [144.9599, -37.8088],
        [144.9585, -37.8072],
      ],
      1240,
    ),
    walk(
      'Queen Victoria Market/Elizabeth St #7',
      'Destination',
      '08:20',
      '08:24',
      [
        [144.9585, -37.8072],
        [144.9572, -37.8076],
      ],
      150,
      [step('DEPART', 'Victoria Street', [144.9585, -37.8072], 150, 'WEST')],
    ),
  ],
}

const TRAIN_ITINERARY = {
  start: '2026-10-12T08:12:00+11:00',
  end: '2026-10-12T08:31:00+11:00',
  duration: 19 * 60,
  legs: [
    walk(
      'Origin',
      'Flinders Street Station',
      '08:12',
      '08:14',
      [
        [144.96706, -37.81827],
        [144.9668, -37.8181],
      ],
      40,
      [],
    ),
    ride(
      'RAIL',
      { shortName: null, longName: 'Craigieburn', color: 'FFBE00', textColor: '000000' },
      'Craigieburn',
      'Flinders Street Station',
      'Flagstaff Station',
      '08:16',
      '08:22',
      [
        [144.9668, -37.8181],
        [144.9625, -37.8101],
        [144.9561, -37.8119],
      ],
      1900,
    ),
    walk(
      'Flagstaff Station',
      'Destination',
      '08:22',
      '08:31',
      [
        [144.9561, -37.8119],
        [144.9572, -37.8076],
      ],
      600,
      [step('DEPART', 'William Street', [144.9561, -37.8119], 600, 'NORTH')],
    ),
  ],
}

/** planConnection's answer, leaving out journeys that use a mode that isn't allowed */
export function transitPlan(allowedModes: string[] | null) {
  const itineraries = [TRAM_ITINERARY, TRAIN_ITINERARY].filter(
    (itinerary) =>
      !allowedModes ||
      itinerary.legs.every((leg) => !leg.transitLeg || allowedModes.includes(leg.mode)),
  )
  return {
    data: {
      planConnection: {
        routingErrors: itineraries.length ? [] : [{ code: 'NO_TRANSIT_CONNECTION' }],
        edges: itineraries.map((node) => ({ node })),
      },
    },
  }
}
