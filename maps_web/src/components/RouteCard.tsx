import type { RouteState } from '../hooks/useRoute'
import type { LngLat } from '../types'
import { formatDistance, formatDuration } from '../utils/format'
import { ElevationProfile } from './ElevationProfile'
import { RouteStatus } from './RouteStatus'
import { Icon } from './icons'
import { TurnIcon } from './TurnIcon'
import './RouteCard.css'

interface RouteCardProps {
  route: RouteState
  onStepClick: (at: LngLat) => void
  /** Offers a GPX download (for walks and rides) */
  onExportGpx?: () => void
  /** Starts turn-by-turn navigation */
  onStart?: () => void
  /** Shows the elevation along the route (for walks and rides) */
  showElevation?: boolean
  /** Where on the route the elevation chart is pointing at */
  onElevationHover?: (at: LngLat | null) => void
}

export function RouteCard({
  route,
  onStepClick,
  onExportGpx,
  onStart,
  showElevation,
  onElevationHover,
}: RouteCardProps) {
  if (route.status !== 'ready') return <RouteStatus state={route} loadingText="Finding a route…" />

  const path = route.data
  return (
    <section className="card">
      <div className="route-summary">
        <span className="route-summary__time">{formatDuration(path.time)}</span>
        <span className="route-summary__distance">{formatDistance(path.distance)}</span>
        {path.ascend !== undefined && path.descend !== undefined && (
          <span className="route-summary__climb" title="Total climb and descent">
            ↑ {Math.round(path.ascend)} m ↓ {Math.round(path.descend)} m
          </span>
        )}
      </div>

      {showElevation && (
        <ElevationProfile coordinates={path.points.coordinates} onHover={onElevationHover} />
      )}

      <div className="route-actions">
        {onStart && (
          <button type="button" className="button button--primary route-start" onClick={onStart}>
            <Icon name="navigate" />
            Start
          </button>
        )}
        {onExportGpx && (
          <button type="button" className="chip" onClick={onExportGpx}>
            <Icon name="download" />
            Export GPX
          </button>
        )}
      </div>

      <ol className="steps">
        {path.instructions.map((step, i) => {
          const [lng, lat] = path.points.coordinates[step.interval[0]]
          return (
            <li key={i}>
              <button type="button" className="step" onClick={() => onStepClick({ lng, lat })}>
                <TurnIcon sign={step.sign} />
                <span>{step.text}</span>
                <span className="step__distance">
                  {step.distance ? formatDistance(step.distance) : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
