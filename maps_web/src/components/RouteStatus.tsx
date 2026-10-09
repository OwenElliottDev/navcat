import type { FetchState } from '../hooks/useFetch'

/** The "loading" and "error" states shared by route and journey results. */
export function RouteStatus({
  state,
  loadingText,
}: {
  state: FetchState<unknown>
  loadingText: string
}) {
  if (state.status === 'loading') {
    return (
      <section className="card">
        <p className="note">{loadingText}</p>
      </section>
    )
  }
  if (state.status === 'error') {
    return (
      <section className="card">
        <p className="error">{state.message}</p>
      </section>
    )
  }
  return null
}
