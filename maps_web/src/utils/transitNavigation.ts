import type { Instruction, Itinerary, LngLat, Position, RoutePath, TransitStep } from '../types'
import { distanceInMetres } from './geo'
import { transitModeLabel } from './transitModes'

// A public transport journey as a route to follow turn by turn, so navigation works the same
// as for a walk or drive: OpenTripPlanner's turns for the walks, and getting on and off for
// the rides.

/** Instruction signs for public transport, alongside GraphHopper's turn signs */
export const SIGN_BOARD = 100
export const SIGN_ALIGHT = 101
const SIGN_ARRIVE = 4

// OTP's turn directions as GraphHopper turn signs (for the arrow), and how to say them
const TURNS: Record<string, { sign: number; text: string }> = {
  HARD_LEFT: { sign: -3, text: 'Turn sharp left' },
  LEFT: { sign: -2, text: 'Turn left' },
  SLIGHTLY_LEFT: { sign: -1, text: 'Bear left' },
  CONTINUE: { sign: 0, text: 'Continue' },
  SLIGHTLY_RIGHT: { sign: 1, text: 'Bear right' },
  RIGHT: { sign: 2, text: 'Turn right' },
  HARD_RIGHT: { sign: 3, text: 'Turn sharp right' },
  UTURN_LEFT: { sign: -98, text: 'Make a U-turn' },
  UTURN_RIGHT: { sign: -98, text: 'Make a U-turn' },
  CIRCLE_CLOCKWISE: { sign: 6, text: 'At the roundabout' },
  CIRCLE_COUNTERCLOCKWISE: { sign: 6, text: 'At the roundabout' },
  ELEVATOR: { sign: 0, text: 'Take the lift' },
  ENTER_STATION: { sign: 0, text: 'Enter the station' },
  EXIT_STATION: { sign: 0, text: 'Leave the station' },
  ENTER_OR_EXIT_STATION: { sign: 0, text: 'Go through the station' },
  FOLLOW_SIGNS: { sign: 0, text: 'Follow the signs' },
}

/** `toStop`: the walk's last turn before a ride, which OTP names after the stop itself */
function stepText(step: TransitStep, toStop: boolean): string {
  const street = toStop ? null : step.streetName
  if (step.relativeDirection === 'DEPART') {
    // "Walk northeast on Swanston Street"
    const heading = step.absoluteDirection?.toLowerCase()
    return ['Walk', heading, street && `on ${street}`].filter(Boolean).join(' ')
  }
  const turn = TURNS[step.relativeDirection] ?? TURNS.CONTINUE
  if (turn.sign === 6) return `${turn.text}, take exit ${step.exit ?? ''}`.trim()
  if (toStop) return `${turn.text} to the stop`
  return street ? `${turn.text} onto ${street}` : turn.text
}

/** The index of the point in `points` (from `from` on) nearest to `at`. */
function nearestIndex(points: Position[], at: LngLat, from: number): number {
  let best = from
  let bestDistance = Infinity
  for (let i = from; i < points.length; i++) {
    const distance = distanceInMetres({ lng: points[i][0], lat: points[i][1] }, at)
    if (distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  }
  return best
}

/**
 * The journey as one line, with an instruction where each walk turns, where each ride
 * starts ("Board the 86 tram towards Bundoora") and ends ("Get off at Lygon St"), and on
 * arrival. Instruction times add up to the whole journey, waits included, so the arrival
 * time shown during navigation matches the timetable.
 */
export function itineraryToPath(itinerary: Itinerary): RoutePath {
  const coordinates: Position[] = []
  const instructions: Instruction[] = []
  const add = (instruction: Omit<Instruction, 'interval'>, start: number) =>
    instructions.push({ ...instruction, interval: [start, start] })

  itinerary.legs.forEach((leg, i) => {
    const offset = coordinates.length
    const points = leg.geometry.coordinates
    coordinates.push(...points)
    const last = offset + Math.max(0, points.length - 1)

    // Time waiting for this leg after the last one ended counts towards this leg
    const previous = itinerary.legs[i - 1]
    const wait = previous ? Math.max(0, Date.parse(leg.start) - Date.parse(previous.end)) : 0
    const legTime = leg.duration * 1000

    if (leg.isTransit) {
      const vehicle = transitModeLabel(leg.mode).toLowerCase()
      const name = leg.route?.name ? `${leg.route.name} ${vehicle}` : vehicle
      const towards = leg.headsign ? ` towards ${leg.headsign}` : ''
      add(
        {
          sign: SIGN_BOARD,
          text: `Board the ${name}${towards} at ${leg.from}`,
          distance: leg.distance,
          time: wait + legTime,
        },
        offset,
      )
      // On the last stretch before the stop, so it's announced on the way there
      add(
        { sign: SIGN_ALIGHT, text: `Get off at ${leg.to}`, distance: 0, time: 0 },
        Math.max(offset, last - 1),
      )
      return
    }

    // A walk: one instruction per turn, at the point nearest where OTP says it is
    let searchFrom = 0
    const steps = leg.steps.length
      ? leg.steps
      : [
          {
            relativeDirection: 'DEPART',
            absoluteDirection: null,
            streetName: null,
            distance: leg.distance,
            at: { lng: points[0]?.[0] ?? 0, lat: points[0]?.[1] ?? 0 },
            exit: null,
          },
        ]
    const beforeRide = Boolean(itinerary.legs[i + 1]?.isTransit)
    steps.forEach((step, j) => {
      searchFrom = j === 0 ? 0 : nearestIndex(points, step.at, searchFrom)
      const share = leg.distance > 0 ? step.distance / leg.distance : 1 / steps.length
      add(
        {
          sign: TURNS[step.relativeDirection]?.sign ?? 0,
          text: stepText(step, beforeRide && j > 0 && j === steps.length - 1),
          distance: step.distance,
          time: (j === 0 ? wait : 0) + legTime * share,
        },
        offset + searchFrom,
      )
    })
  })

  const end = Math.max(0, coordinates.length - 1)
  add({ sign: SIGN_ARRIVE, text: 'Arrive at your destination', distance: 0, time: 0 }, end)

  // Each instruction covers the line up to the next one
  instructions.forEach((instruction, i) => {
    const next = instructions[i + 1]
    instruction.interval = [instruction.interval[0], next ? next.interval[0] : end]
  })

  const distance = itinerary.legs.reduce((sum, leg) => sum + leg.distance, 0)
  return {
    distance,
    time: itinerary.duration * 1000,
    bbox: [0, 0, 0, 0],
    points: { type: 'LineString', coordinates },
    instructions,
  }
}
