import type { AvoidOption } from '../api/capabilities'
import { CAR_AVOID_LABELS } from '../config'
import './CarOptions.css'

interface CarOptionsProps {
  /** What can be avoided with this routing graph */
  available: AvoidOption[]
  /** The ids of what's chosen */
  avoid: string[]
  onChange: (avoid: string[]) => void
}

/** Things for a drive to avoid, like tolls and traffic lights. */
export function CarOptions({ available, avoid, onChange }: CarOptionsProps) {
  if (!available.length) return null

  function toggle(name: string) {
    onChange(avoid.includes(name) ? avoid.filter((a) => a !== name) : [...avoid, name])
  }

  return (
    <div className="car-options" role="group" aria-label="Avoid">
      <span className="car-options__label">Avoid</span>
      {available.map(({ id }) => (
        <button
          key={id}
          type="button"
          className="chip"
          aria-pressed={avoid.includes(id)}
          onClick={() => toggle(id)}
        >
          {CAR_AVOID_LABELS[id] ?? id}
        </button>
      ))}
    </div>
  )
}
