import { useRef, useState } from 'react'
import { useClickOutside } from '../hooks/useClickOutside'
import type { TripTime } from '../types'
import { transitModeLabel } from '../utils/transitModes'
import './TransitOptions.css'

interface TransitOptionsProps {
  /** null for "leave now" */
  time: TripTime | null
  onTimeChange: (time: TripTime | null) => void
  /** Every mode in the timetables */
  modes: string[]
  /** The modes to keep to; any when empty */
  only: string[]
  onOnlyChange: (only: string[]) => void
}

type When = 'now' | TripTime['type']

/** The current local time as a datetime-local string, e.g. "2026-10-04T08:30". */
function localNow(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/** When to travel, and which kinds of transport to use. */
export function TransitOptions({
  time,
  onTimeChange,
  modes,
  only,
  onOnlyChange,
}: TransitOptionsProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useClickOutside(menuRef, isMenuOpen, () => setIsMenuOpen(false))

  function changeWhen(when: When) {
    if (when === 'now') onTimeChange(null)
    // Keep the chosen time when switching between "depart at" and "arrive by"
    else onTimeChange({ type: when, time: time?.time ?? localNow() })
  }

  function toggleMode(mode: string) {
    onOnlyChange(modes.filter((m) => (m === mode) !== only.includes(m)))
  }

  return (
    <div className="transit-options">
      <select
        className="transit-options__control"
        aria-label="When"
        value={time?.type ?? 'now'}
        onChange={(e) => changeWhen(e.target.value as When)}
      >
        <option value="now">Leave now</option>
        <option value="departAt">Depart at</option>
        <option value="arriveBy">Arrive by</option>
      </select>
      {time && (
        <input
          type="datetime-local"
          className="transit-options__control transit-options__time"
          aria-label={time.type === 'arriveBy' ? 'Arrival time' : 'Departure time'}
          value={time.time}
          onChange={(e) => onTimeChange(e.target.value ? { ...time, time: e.target.value } : null)}
        />
      )}

      {modes.length > 1 && (
        <div ref={menuRef} className="mode-menu">
          <button
            type="button"
            className="chip mode-menu__button"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {only.length ? only.map(transitModeLabel).join(', ') : 'Any transport'}
          </button>
          {isMenuOpen && (
            <div
              className="mode-menu__list"
              role="group"
              aria-label="Use only these kinds of transport"
            >
              {modes.map((mode) => (
                <label key={mode} className="mode-menu__item">
                  <input
                    type="checkbox"
                    checked={only.includes(mode)}
                    onChange={() => toggleMode(mode)}
                  />
                  {transitModeLabel(mode)}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
