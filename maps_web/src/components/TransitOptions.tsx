import type { TripTime } from '../types'
import { transitModeLabel } from '../utils/transitModes'
import './TransitOptions.css'

interface TransitOptionsProps {
  /** null for "leave now" */
  time: TripTime | null
  onTimeChange: (time: TripTime | null) => void
  /** Every mode in the timetables */
  modes: string[]
  /** Modes the user has turned off */
  excluded: string[]
  onExcludedChange: (excluded: string[]) => void
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
  excluded,
  onExcludedChange,
}: TransitOptionsProps) {
  function changeWhen(when: When) {
    if (when === 'now') onTimeChange(null)
    // Keep the chosen time when switching between "depart at" and "arrive by"
    else onTimeChange({ type: when, time: time?.time ?? localNow() })
  }

  function toggleMode(mode: string) {
    onExcludedChange(
      excluded.includes(mode) ? excluded.filter((m) => m !== mode) : [...excluded, mode],
    )
  }

  const allowedCount = modes.filter((mode) => !excluded.includes(mode)).length

  return (
    <div className="transit-options">
      <div className="row">
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
            onChange={(e) =>
              onTimeChange(e.target.value ? { ...time, time: e.target.value } : null)
            }
          />
        )}
      </div>

      {modes.length > 1 && (
        <div
          className="transit-options__modes"
          role="group"
          aria-label="Use these kinds of transport"
        >
          {modes.map((mode) => {
            const isOn = !excluded.includes(mode)
            return (
              <button
                key={mode}
                type="button"
                className="chip mode-chip"
                aria-pressed={isOn}
                // At least one mode has to stay on
                disabled={isOn && allowedCount === 1}
                onClick={() => toggleMode(mode)}
              >
                {transitModeLabel(mode)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
