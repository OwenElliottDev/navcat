import type { Lane } from '../utils/lanes'

// Each lane marking as an arrow angle, in degrees from straight ahead
const ANGLES: Record<string, number> = {
  through: 0,
  none: 0,
  slight_left: -45,
  left: -90,
  sharp_left: -135,
  slight_right: 45,
  right: 90,
  sharp_right: 135,
  merge_to_left: -30,
  merge_to_right: 30,
}

/** A row of lanes, left to right, with the ones to be in highlighted. */
export function LaneGuide({ lanes }: { lanes: Lane[] }) {
  const label = `Use the ${describe(lanes)}`
  return (
    <div className="lane-guide" role="img" aria-label={label}>
      {lanes.map((lane, i) => (
        <svg
          key={i}
          className={`lane${lane.active ? ' lane--active' : ''}`}
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          {lane.directions.map((direction) =>
            direction === 'reverse' ? (
              <path key={direction} d="M13 16V8a3 3 0 0 0-6 0v6M7 14l-2.5-2.5M7 14l2.5-2.5" />
            ) : (
              <g key={direction} transform={`rotate(${ANGLES[direction] ?? 0} 10 13)`}>
                <path d="M10 18V5M10 5l-3.5 3.5M10 5l3.5 3.5" />
              </g>
            ),
          )}
        </svg>
      ))}
    </div>
  )
}

/** "left 2 lanes" style wording for screen readers */
function describe(lanes: Lane[]): string {
  const active = lanes.flatMap((lane, i) => (lane.active ? [i] : []))
  if (active.length === lanes.length) return 'any lane'
  const side =
    active[active.length - 1] < lanes.length / 2
      ? 'left'
      : active[0] >= lanes.length / 2
        ? 'right'
        : 'middle'
  return `${side} ${active.length === 1 ? 'lane' : `${active.length} lanes`}`
}
