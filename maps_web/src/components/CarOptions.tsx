import { CAR_AVOIDS, type CarAvoid } from '../config'
import './CarOptions.css'

interface CarOptionsProps {
  /** What can be avoided with this routing graph */
  available: CarAvoid[]
  avoid: CarAvoid[]
  onChange: (avoid: CarAvoid[]) => void
}

/** Things for a drive to avoid, like tolls and traffic lights. */
export function CarOptions({ available, avoid, onChange }: CarOptionsProps) {
  if (!available.length) return null

  function toggle(name: CarAvoid) {
    onChange(avoid.includes(name) ? avoid.filter((a) => a !== name) : [...avoid, name])
  }

  return (
    <div className="car-options" role="group" aria-label="Avoid">
      <span className="car-options__label">Avoid</span>
      {available.map((name) => (
        <button
          key={name}
          type="button"
          className="chip"
          aria-pressed={avoid.includes(name)}
          onClick={() => toggle(name)}
        >
          {CAR_AVOIDS[name].label}
        </button>
      ))}
    </div>
  )
}
