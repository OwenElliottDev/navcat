import { useEffect } from 'react'

/** Keeps the screen on while `active` (where the browser supports it). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let released = false

    const acquire = () => {
      navigator.wakeLock.request('screen').then(
        (sentinel) => {
          if (released) sentinel.release()
          else lock = sentinel
        },
        () => {
          // Refused (e.g. low battery): the screen may sleep
        },
      )
    }
    // The lock is dropped whenever the page is hidden; take it again on return
    const onVisible = () => document.visibilityState === 'visible' && acquire()

    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      released = true
      lock?.release()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active])
}
