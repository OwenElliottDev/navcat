import { useEffect, useState } from 'react'
import { useMap } from '../map/MapContext'
import './PitchToggle.css'

const TILT = 60

/** Switches the map between flat, top-down (2D) and tilted (3D). */
export function PitchToggle() {
  const map = useMap()
  const [is3d, setIs3d] = useState(false)

  useEffect(() => {
    if (!map) return
    const update = () => setIs3d(map.getPitch() > 1)
    update()
    map.on('pitchend', update)
    return () => {
      map.off('pitchend', update)
    }
  }, [map])

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
