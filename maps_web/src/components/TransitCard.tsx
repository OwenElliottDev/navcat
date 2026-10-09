import type { CSSProperties } from 'react'
import type { TransitPlanState } from '../hooks/useTransitPlan'
import type { Itinerary, LngLat, TransitLeg } from '../types'
import { formatClock, formatDistance, formatDuration } from '../utils/format'
import { transitModeLabel as modeLabel } from '../utils/transitModes'
import { Icon } from './icons'
import { RouteStatus } from './RouteStatus'
import './TransitCard.css'

interface TransitCardProps {
  plan: TransitPlanState
  selected: Itinerary | null
  onSelect: (itinerary: Itinerary) => void
  onLegClick: (at: LngLat) => void
  /** Starts turn-by-turn navigation along the selected journey */
  onStart: () => void
}

/** Public transport journey options, with the selected one broken into legs. */
export function TransitCard({ plan, selected, onSelect, onLegClick, onStart }: TransitCardProps) {
  if (plan.status !== 'ready')
    return <RouteStatus state={plan} loadingText="Finding public transport…" />

  return (
    <>
      <section className="card">
        <ul className="itineraries">
          {plan.data.map((itinerary, i) => (
            <li key={i}>
              <button
                type="button"
                className="itinerary"
                aria-pressed={itinerary === selected}
                onClick={() => onSelect(itinerary)}
              >
                <span className="itinerary__times">
                  {formatClock(itinerary.start)} – {formatClock(itinerary.end)}
                </span>
                <span className="itinerary__duration">
                  {formatDuration(itinerary.duration * 1000)}
                </span>
                <span className="itinerary__legs">
                  {itinerary.legs
                    .filter((leg) => leg.isTransit)
                    .map((leg, j) => (
                      <RouteBadge key={j} leg={leg} />
                    ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <section className="card">
          <button type="button" className="button button--primary transit-start" onClick={onStart}>
            <Icon name="navigate" />
            Start
          </button>
          <ol className="legs">
            {selected.legs.map((leg, i) => (
              <li key={i}>
                <LegRow leg={leg} onClick={onLegClick} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}

/** "86" on the route's own colour, e.g. for a tram. */
function RouteBadge({ leg }: { leg: TransitLeg }) {
  return (
    <span
      className="route-badge"
      style={{
        background: leg.route?.color,
        color: leg.route?.color ? (leg.route.textColor ?? '#fff') : undefined,
      }}
    >
      {leg.route?.name || modeLabel(leg.mode)}
    </span>
  )
}

function LegRow({ leg, onClick }: { leg: TransitLeg; onClick: (at: LngLat) => void }) {
  const [lng, lat] = leg.geometry.coordinates[0] ?? []
  const flyToStart = () => lng !== undefined && onClick({ lng, lat })

  if (!leg.isTransit) {
    return (
      <button type="button" className="leg leg--walk" onClick={flyToStart}>
        <span className="leg__title">
          {modeLabel(leg.mode)} {formatDistance(leg.distance)}
          {leg.to && <> to {leg.to}</>}
        </span>
        <span className="leg__meta">{formatDuration(leg.duration * 1000)}</span>
      </button>
    )
  }

  // The timeline down the side is drawn in the line's own colour
  const style = { '--leg-color': leg.route?.color } as CSSProperties
  return (
    <button type="button" className="leg" style={style} onClick={flyToStart}>
      <span className="leg__title">
        <RouteBadge leg={leg} /> {modeLabel(leg.mode)}
        {leg.headsign && <> towards {leg.headsign}</>}
      </span>
      <span className="leg__stop">
        <time>{formatClock(leg.start)}</time> {leg.from}
      </span>
      <span className="leg__stop">
        <time>{formatClock(leg.end)}</time> {leg.to}
      </span>
      <span className="leg__meta">{formatDuration(leg.duration * 1000)}</span>
    </button>
  )
}
