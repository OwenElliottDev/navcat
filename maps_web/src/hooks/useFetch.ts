import { useEffect, useRef, useState } from 'react'
import axios from 'axios'

export type FetchState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string }

interface Settled<T> {
  key: string
  version: number
  state: FetchState<T>
}

/**
 * Runs `request` whenever `key` or `version` changes, cancelling any request still in flight.
 * A null key means there's nothing to fetch. Bumping `version` fetches the same thing again,
 * showing the data already there until the new answer arrives.
 */
export function useFetch<T>(
  key: string | null,
  request: (signal: AbortSignal) => Promise<T>,
  errorMessage: (err: unknown) => string,
  version = 0,
): FetchState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null)

  // Use the latest callbacks without re-running the request when they change
  const callbacks = useRef({ request, errorMessage })
  useEffect(() => {
    callbacks.current = { request, errorMessage }
  })

  useEffect(() => {
    if (key === null) return

    const controller = new AbortController()
    callbacks.current
      .request(controller.signal)
      .then((data) => setSettled({ key, version, state: { status: 'ready', data } }))
      .catch((err) => {
        if (axios.isCancel(err)) return
        setSettled({
          key,
          version,
          state: { status: 'error', message: callbacks.current.errorMessage(err) },
        })
      })

    return () => controller.abort()
  }, [key, version])

  if (key === null) return { status: 'idle' }
  if (settled?.key !== key) return { status: 'loading' }
  // While fetching a new version, keep showing the last answer unless it was an error
  const isCurrent = settled.version === version || settled.state.status === 'ready'
  return isCurrent ? settled.state : { status: 'loading' }
}

/** True when a backend couldn't be reached at all (container down or still starting). */
export function isUnreachable(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false
  return !err.response || [502, 503, 504].includes(err.response.status)
}
