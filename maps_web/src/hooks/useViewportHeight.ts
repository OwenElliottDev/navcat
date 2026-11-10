import { useSyncExternalStore } from 'react'
import { viewportHeight } from '../utils/viewport'

function subscribe(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

/** The app's height (`viewportHeight`), updating as it resizes (e.g. when a phone's browser toolbar hides). */
export function useViewportHeight(): number {
  return useSyncExternalStore(subscribe, viewportHeight)
}
