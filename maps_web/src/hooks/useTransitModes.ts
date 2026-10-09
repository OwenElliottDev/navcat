import { useEffect, useState } from 'react'
import { getTransitModes } from '../api/transit'
import { sortTransitModes } from '../utils/transitModes'

/**
 * The transit modes in OTP's timetables, in display order. Fetched when transit is
 * `active`, and fetched again next time if OTP wasn't answering (e.g. still starting).
 */
export function useTransitModes(active: boolean): string[] {
  const [modes, setModes] = useState<string[]>([])
  const hasModes = modes.length > 0

  useEffect(() => {
    if (!active || hasModes) return
    let cancelled = false
    getTransitModes().then(
      (found) => {
        if (!cancelled) setModes(sortTransitModes(found))
      },
      () => {
        // OTP down: no mode filter to offer this time
      },
    )
    return () => {
      cancelled = true
    }
  }, [active, hasModes])

  return modes
}
