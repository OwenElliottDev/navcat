import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

/** The window's height, updating as it resizes (e.g. when a phone's browser toolbar hides). */
export function useViewportHeight(): number {
  return useSyncExternalStore(subscribe, () => window.innerHeight)
}
