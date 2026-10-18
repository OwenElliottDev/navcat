import { useEffect, useState, type ReactNode } from 'react'
import { getFeatures } from '../api/features'
import type { Features } from '../types'
import { FeaturesContext, NO_FEATURES } from './FeaturesContext'

const FIRST_RETRY_MS = 10_000
const MAX_RETRY_MS = 5 * 60_000

/** What this server lets people do, e.g. whether they can add places, reviews and photos. */
export function FeaturesProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<Features>(NO_FEATURES)

  // Keep asking, less often each time, until the backend answers (it may be starting up), so
  // a failure at page load doesn't hide everything until the next reload
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const load = (retryMs: number) =>
      getFeatures()
        .then((features) => !stopped && setFeatures(features))
        .catch(() => {
          if (stopped) return
          timer = setTimeout(() => load(Math.min(retryMs * 2, MAX_RETRY_MS)), retryMs)
        })
    load(FIRST_RETRY_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [])

  return <FeaturesContext value={features}>{children}</FeaturesContext>
}
