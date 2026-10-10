import { useNow } from '../hooks/useNow'
import type { Lane } from '../utils/lanes'
import type { Guidance } from '../utils/navigation'
import { formatClock, formatDistance, formatDuration } from '../utils/format'
import { Icon } from './icons'
import { LaneGuide } from './LaneGuide'
import { TurnIcon } from './TurnIcon'
import './NavigationView.css'

interface NavigationViewProps {
  guidance: Guidance | null
  /** When the timetable says you'll arrive (public transport), instead of working it out */
  arrivesAt?: string
  /** The lanes to be in for the next instruction, where OSM maps them */
  lanes: Lane[] | null
  /** Shown instead of guidance, e.g. waiting for GPS */
  status: string | null
  isRerouting: boolean
  isSimulated: boolean
  isMuted: boolean
  onToggleMute: () => void
  isFollowing: boolean
  onRecentre: () => void
  /** Tilted, or a flat top-down map */
  is3d: boolean
  onToggle3d: () => void
  onEnd: () => void
}

/** The turn-by-turn screen: next instruction on top, trip summary at the bottom. */
export function NavigationView(props: NavigationViewProps) {
  const { guidance, lanes, status, isRerouting, isSimulated, isMuted, onToggleMute } = props
  const now = useNow(15_000)

  let banner
  let showsLanes = false
  if (isRerouting) {
    banner = <p className="nav-banner__text">Finding a new route…</p>
  } else if (guidance?.arrived) {
    banner = <p className="nav-banner__text">You’ve arrived</p>
  } else if (guidance?.next) {
    showsLanes = Boolean(lanes)
    banner = (
      <>
        <span className="nav-banner__icon">
          <TurnIcon sign={guidance.next.sign} />
        </span>
        <div>
          <p className="nav-banner__distance">{formatDistance(guidance.toNext)}</p>
          <p className="nav-banner__text">{guidance.next.text}</p>
        </div>
        {lanes && <LaneGuide lanes={lanes} />}
      </>
    )
  } else {
    banner = <p className="nav-banner__text">{status ?? 'Looking for your location…'}</p>
  }

  const arrival =
    props.arrivesAt ?? (guidance && new Date(now.getTime() + guidance.remainingTime).toISOString())

  return (
    <>
      <div
        className={`nav-banner${showsLanes ? ' nav-banner--lanes' : ''}`}
        role="status"
        aria-live="polite"
      >
        {banner}
      </div>
      {status && guidance && <p className="nav-status glass">{status}</p>}

      <div className="nav-controls">
        <button
          type="button"
          className="nav-round glass"
          aria-label={isMuted ? 'Turn voice on' : 'Mute voice'}
          onClick={onToggleMute}
        >
          <Icon name={isMuted ? 'muted' : 'volume'} />
        </button>
        <button
          type="button"
          className="nav-round nav-round--text glass"
          aria-label={props.is3d ? 'Show the map flat (2D)' : 'Tilt the map (3D)'}
          onClick={props.onToggle3d}
        >
          {props.is3d ? '2D' : '3D'}
        </button>
        {!props.isFollowing && (
          <button type="button" className="nav-recentre glass" onClick={props.onRecentre}>
            Re-centre
          </button>
        )}
      </div>

      <div className="nav-trip glass">
        <div>
          <p className="nav-trip__eta">{arrival ? formatClock(arrival) : '—'}</p>
          <p className="note">
            {guidance
              ? `${formatDuration(guidance.remainingTime)} · ${formatDistance(guidance.remainingDistance)}`
              : 'Starting…'}
            {isSimulated && ' · simulated'}
          </p>
        </div>
        <button type="button" className="button nav-trip__end" onClick={props.onEnd}>
          <Icon name="close" />
          End
        </button>
      </div>
    </>
  )
}
