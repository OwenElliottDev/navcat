import { CYCLING_STYLES, PROFILE_LABELS } from '../config'
import { useSideScroll } from '../hooks/useSideScroll'
import type { End, PhotonFeature, Waypoint } from '../types'
import { humanize } from '../utils/format'
import { Icon, type IconName } from './icons'
import { PlaceInput, type Shortcut } from './PlaceInput'
import './DirectionsForm.css'

interface DirectionsFormProps {
  from: Waypoint | null
  to: Waypoint | null
  profiles: string[]
  profile: string
  onPick: (end: End, place: PhotonFeature) => void
  /** Saved places and recent searches to offer for each end */
  shortcutsFor: (end: End) => Shortcut[]
  onProfileChange: (profile: string) => void
  onSwap: () => void
  onClose: () => void
}

const MODE_ICONS: Record<string, IconName> = {
  foot: 'walk',
  bike: 'bike',
  transit: 'transit',
  car: 'car',
}

const CYCLING_ORDER = Object.keys(CYCLING_STYLES)
const DEFAULT_CYCLING = CYCLING_ORDER[0]
const isCycling = (profile: string) => profile in CYCLING_STYLES

export function DirectionsForm({
  from,
  to,
  profiles,
  profile,
  onPick,
  shortcutsFor,
  onProfileChange,
  onSwap,
  onClose,
}: DirectionsFormProps) {
  const stylesRef = useSideScroll<HTMLDivElement>()
  // One "Cycle" button stands for every cycling profile; its styles get their own row
  const modes = profiles.filter((name) => !isCycling(name) || name === DEFAULT_CYCLING)
  const cyclingStyles = profiles
    .filter(isCycling)
    .toSorted((a, b) => CYCLING_ORDER.indexOf(a) - CYCLING_ORDER.indexOf(b))
  const isPressed = (name: string) =>
    name === profile || (name === DEFAULT_CYCLING && isCycling(profile))

  return (
    <div>
      <div className="row directions">
        <div className="directions__ends">
          <PlaceInput
            label="Start"
            placeholder="Start"
            dot="from"
            value={from?.label}
            autoFocus={!from}
            onPick={(place) => onPick('from', place)}
            shortcuts={shortcutsFor('from')}
          />
          <PlaceInput
            label="Destination"
            placeholder="Destination"
            dot="to"
            value={to?.label}
            onPick={(place) => onPick('to', place)}
            shortcuts={shortcutsFor('to')}
          />
        </div>

        <div className="directions__buttons">
          <button
            type="button"
            className="icon-button"
            aria-label="Close directions"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Swap start and destination"
            onClick={onSwap}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M5 2v12M5 14l-3-3M5 14l3-3M11 14V2M11 2L8 5M11 2l3 3"
                stroke="currentColor"
                strokeWidth="1.6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="profiles" role="group" aria-label="Travel mode">
        {modes.map((name) => (
          <button
            key={name}
            type="button"
            className="profiles__option"
            aria-pressed={isPressed(name)}
            // Re-tapping Cycle keeps the current style
            onClick={() => onProfileChange(isPressed(name) ? profile : name)}
          >
            {MODE_ICONS[name] && <Icon name={MODE_ICONS[name]} />}
            <span>{PROFILE_LABELS[name] ?? humanize(name)}</span>
          </button>
        ))}
      </div>

      {isCycling(profile) && cyclingStyles.length > 1 && (
        <div ref={stylesRef} className="cycling-styles" role="group" aria-label="Kind of cycling">
          {cyclingStyles.map((name) => (
            <button
              key={name}
              type="button"
              className="chip"
              aria-pressed={name === profile}
              onClick={() => onProfileChange(name)}
            >
              {CYCLING_STYLES[name]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
