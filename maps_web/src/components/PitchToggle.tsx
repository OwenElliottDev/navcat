import { useMap } from '../map/MapContext'
import './PitchToggle.css'

const TILT = 60

/** Switches the map between flat, top-down (2D) and tilted (3D). */
export function PitchToggle({ is3d }: { is3d: boolean }) {
  const map = useMap()
  const label = is3d ? 'Show the map flat (2D)' : 'Tilt the map (3D)'
  return (
    <button
      type="button"
      className="pitch-toggle"
      aria-label={label}
      title={label}
      onClick={() => map?.easeTo({ pitch: is3d ? 0 : TILT, duration: 600 })}
    >
      {is3d ? '2D' : '3D'}
    </button>
  )
}
