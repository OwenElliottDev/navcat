// The backend's /capabilities (GraphHopper's side), and a walk from Flinders Street Station to
// Queen Victoria Market.

const AVOID_RULES: Record<string, string> = {
  motorways: 'road_class == MOTORWAY',
  tolls: 'toll == ALL',
  ferries: 'road_environment == FERRY',
  traffic_lights: 'crossing == TRAFFIC_SIGNALS',
  small_roads: 'road_class == RESIDENTIAL || road_class == SERVICE',
}

const STEEP_HILLS = [
  { if: 'max_slope >= 12 || max_slope <= -12', multiply_by: '0.05' },
  { else_if: 'max_slope >= 8 || max_slope <= -8', multiply_by: '0.2' },
  { else_if: 'max_slope >= 5 || max_slope <= -5', multiply_by: '0.6' },
]

export const ALL_PROFILES = ['foot', 'bike', 'bike_paths', 'racingbike', 'car']
export const ALL_AVOIDS = Object.keys(AVOID_RULES)

export function routingCapabilities(
  profiles = ALL_PROFILES,
  avoid = ALL_AVOIDS,
  steepHills = true,
) {
  return {
    area: [112, -44, 154, -10],
    profiles,
    avoid: avoid.map((id) => ({
      id,
      priority: [{ if: AVOID_RULES[id], multiply_by: id === 'traffic_lights' ? '0.4' : '0.1' }],
    })),
    steepHills: steepHills ? { priority: STEEP_HILLS } : null,
  }
}

const POINTS: [number, number, number][] = [
  [144.96706, -37.81827, 12],
  [144.9653, -37.81776, 11],
  [144.9644, -37.8175, 11],
  [144.9629, -37.8146, 15],
  [144.9614, -37.8117, 19],
  [144.9599, -37.8088, 24],
  [144.9585, -37.8072, 27],
  [144.9572, -37.8076, 26],
]

/** Rough speeds in m/s, so a drive is quicker than a walk */
const SPEEDS: Record<string, number> = { foot: 1.4, car: 8 }

export function routeResponse(profile: string) {
  const speed = SPEEDS[profile] ?? 4.5
  const legs = [250, 1240, 120, 0]
  const time = (metres: number) => Math.round((metres / speed) * 1000)
  return {
    paths: [
      {
        distance: 1610,
        time: time(1610),
        ascend: 16,
        descend: 2,
        bbox: [144.9572, -37.81827, 144.96706, -37.8072],
        points: { type: 'LineString', coordinates: POINTS },
        points_encoded: false,
        instructions: [
          {
            text: 'Continue onto Flinders Street',
            sign: 0,
            interval: [0, 2],
            distance: legs[0],
            time: time(legs[0]),
          },
          {
            text: 'Turn right onto Elizabeth Street',
            sign: 2,
            interval: [2, 6],
            distance: legs[1],
            time: time(legs[1]),
          },
          {
            text: 'Turn left onto Victoria Street',
            sign: -2,
            interval: [6, 7],
            distance: legs[2],
            time: time(legs[2]),
          },
          { text: 'Arrive at destination', sign: 4, interval: [7, 7], distance: 0, time: 0 },
        ],
        details: {
          osm_way_id: [
            [0, 2, 111],
            [2, 6, 222],
            [6, 7, 333],
          ],
        },
      },
    ],
  }
}

/** turn:lanes for each approach /api/lanes is asked about, by OSM way */
export const TURN_LANES: Record<number, string> = { 111: 'left|through|through;right' }
