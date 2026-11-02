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

/** Labels for what a drive can avoid; the options and their rules come from /api/capabilities. */
export const CAR_AVOID_LABELS: Record<string, string> = {
  motorways: 'Motorways',
  tolls: 'Tolls',
  ferries: 'Ferries',
  traffic_lights: 'Traffic lights',
  small_roads: 'Small roads',
}

/** Travel modes in the order they're offered; the first is the default. */
export const PROFILE_LABELS: Record<string, string> = {
  foot: 'Walk',
  bike: 'Cycle',
  [TRANSIT_PROFILE]: 'Transit',
  car: 'Drive',
}
