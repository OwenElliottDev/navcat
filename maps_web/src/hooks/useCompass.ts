import { useEffect, useState } from 'react'
import { angleDifference, compassFromOrientation, smoothAngle } from '../utils/heading'

/** iOS's compass, on its orientation events */
interface WebkitOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}

// Each reading moves the heading this far towards it, and only a turn of more than STEP is
// passed on (orientation events come many times a second)
const SMOOTHING = 0.2
const STEP = 4

/** The way the phone points, in degrees from north, or null with no compass. */
export function useCompass(active: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null)

  useEffect(() => {
    if (!active) return
    let smoothed: number | null = null
    let shown: number | null = null

    function read(event: WebkitOrientationEvent) {
      const screenAngle = screen.orientation?.angle ?? 0
      let reading: number | null = null
      if (event.webkitCompassHeading !== undefined) {
        if ((event.webkitCompassAccuracy ?? 0) < 0) return // not calibrated
        reading = (event.webkitCompassHeading + screenAngle) % 360
      } else if (event.absolute && event.alpha !== null) {
        reading = compassFromOrientation(
          event.alpha,
          event.beta ?? 0,
          event.gamma ?? 0,
          screenAngle,
        )
      }
      if (reading === null) return
      smoothed = smoothed === null ? reading : smoothAngle(smoothed, reading, SMOOTHING)
      if (shown === null || Math.abs(angleDifference(shown, smoothed)) > STEP) {
        shown = smoothed
        setHeading(Math.round(smoothed))
      }
    }

    // Chrome has a separate event for orientation relative to north; iOS adds it to the usual one
    const type =
      'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'
    window.addEventListener(type, read as EventListener)
    return () => {
      window.removeEventListener(type, read as EventListener)
      setHeading(null)
    }
  }, [active])

  return heading
}
