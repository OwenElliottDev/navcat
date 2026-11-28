import type { CSSProperties } from 'react'
import type { TransitPlanState } from '../hooks/useTransitPlan'
import type { Itinerary, LngLat, TransitLeg } from '../types'
import { formatClock, formatDistance, formatDuration } from '../utils/format'
import { transitModeLabel as modeLabel } from '../utils/transitModes'
import { Icon } from './icons'
import { RouteStatus } from './RouteStatus'
import './RouteCard.css'
import './TransitCard.css'

interface TransitCardProps {
  plan: TransitPlanState
  /** The journey whose legs are showing, rather than the list of options */
  opened: Itinerary | null
  onOpen: (itinerary: Itinerary | null) => void
  onLegClick: (at: LngLat) => void
  /** Starts turn-by-turn navigation along the opened journey */
  onStart: () => void
}

/** Public transport journey options, or the one that's opened broken into legs. */
export function TransitCard({ plan, opened, onOpen, onLegClick, onStart }: TransitCardProps) {
  if (plan.status !== 'ready')
    return <RouteStatus state={plan} loadingText="Finding public transport…" />

  if (opened) {
    return (
      <section className="card transit-card">
        <button type="button" className="link-button back-link" onClick={() => onOpen(null)}>
          <Icon name="back" /> Options
        </button>
        <div className="route-summary">
          <span className="route-summary__time">{formatDuration(opened.duration * 1000)}</span>
          <span className="route-summary__distance">
            {formatClock(opened.start)} – {formatClock(opened.end)}
          </span>
        </div>
        <div className="route-actions">
          <button type="button" className="button button--primary route-start" onClick={onStart}>
            <Icon name="navigate" />
            Start
          </button>
        </div>
        <ol className="legs">
          {opened.legs.map((leg, i) => (
            <li key={i}>
              <LegRow leg={leg} onClick={onLegClick} />
            </li>
          ))}
        </ol>
      </section>
    )
  }

  return (
    <section className="card transit-card">
      <ul className="itineraries">
        {plan.data.map((itinerary, i) => (
          <li key={i}>
            <button type="button" className="itinerary" onClick={() => onOpen(itinerary)}>
              <span className="itinerary__times">
                {formatClock(itinerary.start)} – {formatClock(itinerary.end)}
              </span>
              <span className="itinerary__duration">
                {formatDuration(itinerary.duration * 1000)}
              </span>
              <span className="itinerary__legs">
                {itinerary.legs.map((leg, j) => (
                  <span key={j} className="itinerary__leg">
                    {leg.isTransit ? (
                      <RouteBadge leg={leg} />
                    ) : (
                      <span className="itinerary__walk">
                        <Icon name="walk" />
                        {formatDuration(leg.duration * 1000)}
                      </span>
                    )}
                  </span>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
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
