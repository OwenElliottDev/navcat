export const MAP_STYLE_URL = '/styles/basic-preview/style.json'

/** Australia, as [[west, south], [east, north]]. */
export const INITIAL_BOUNDS: [[number, number], [number, number]] = [
  [112, -44],
  [154, -10],
]

export const COLORS = {
  route: '#1A5FC8',
  start: '#0F7A66',
  walk: '#5E6A6B',
}

/** Public transport isn't a GraphHopper profile; it's planned by OpenTripPlanner. */
export const TRANSIT_PROFILE = 'transit'

/**
 * Kinds of cycling (GraphHopper profiles), offered once "Cycle" is picked.
 * The first is what "Cycle" starts with. Any not configured in GraphHopper are hidden.
 */
export const CYCLING_STYLES: Record<string, string> = {
  bike: 'Everyday',
  bike_paths: 'Bike paths',
  racingbike: 'Road bike',
  gravel: 'Gravel',
  mtb: 'Mountain bike',
}

/**
 * What a drive can avoid, each a GraphHopper custom model rule that makes those roads less
 * likely (not forbidden, so a route is still found when there's no other way). `needs` is the
 * encoded value a rule uses; options whose value isn't in the routing graph are hidden.
 */
export const CAR_AVOIDS = {
  motorways: {
    label: 'Motorways',
    needs: 'road_class',
    condition: 'road_class == MOTORWAY',
    factor: 0.1,
  },
  tolls: { label: 'Tolls', needs: 'toll', condition: 'toll == ALL', factor: 0.1 },
  ferries: {
    label: 'Ferries',
    needs: 'road_environment',
    condition: 'road_environment == FERRY',
    factor: 0.1,
  },
  // Roads touching a highway=traffic_signals node or a signalised crossing (our GraphHopper is
  // patched for the former: docker_maps/graphhopper/traffic-signals.patch)
  trafficLights: {
    label: 'Traffic lights',
    needs: 'crossing',
    condition: 'crossing == TRAFFIC_SIGNALS',
    factor: 0.4,
  },
  smallRoads: {
    label: 'Small roads',
    needs: 'road_class',
    condition:
      'road_class == RESIDENTIAL || road_class == SERVICE || road_class == UNCLASSIFIED || road_class == LIVING_STREET || road_class == TRACK',
    factor: 0.4,
  },
} as const

export type CarAvoid = keyof typeof CAR_AVOIDS

/** Travel modes in the order they're offered; the first is the default. */
export const PROFILE_LABELS: Record<string, string> = {
  foot: 'Walk',
  bike: 'Cycle',
  [TRANSIT_PROFILE]: 'Transit',
  car: 'Drive',
}
