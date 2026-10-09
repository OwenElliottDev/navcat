import { useEffect, useRef, useState } from 'react'
import axios from 'axios'

export type FetchState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string }

interface Settled<T> {
  key: string
  state: FetchState<T>
}

/**
 * Runs `request` whenever `key` changes, cancelling any request still in flight.
 * A null key means there's nothing to fetch.
 */
export function useFetch<T>(
  key: string | null,
  request: (signal: AbortSignal) => Promise<T>,
  errorMessage: (err: unknown) => string,
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
      .then((data) => setSettled({ key, state: { status: 'ready', data } }))
      .catch((err) => {
        if (axios.isCancel(err)) return
        setSettled({
          key,
          state: { status: 'error', message: callbacks.current.errorMessage(err) },
        })
      })

    return () => controller.abort()
  }, [key])

  if (key === null) return { status: 'idle' }
  return settled?.key === key ? settled.state : { status: 'loading' }
}

/** True when a backend couldn't be reached at all (container down or still starting). */
export function isUnreachable(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false
  return !err.response || [502, 503, 504].includes(err.response.status)
}
