import { useMemo } from 'react'
import { getLanes } from '../api/lanes'
import type { RoutePath } from '../types'
import { approaches, parseLanes, type Lane } from '../utils/lanes'
import { useFetch } from './useFetch'

/**
 * The lanes to be in for each of a route's instructions (by index), where OSM maps them.
 * Lane guidance is a bonus: without it (or the backend), navigation carries on as before.
 */
export function useLanes(path: RoutePath | null): Map<number, Lane[]> {
  const wanted = useMemo(
    () =>
      path
        ? approaches(path).flatMap((approach, index) => (approach ? [{ approach, index }] : []))
        : [],
    [path],
  )
  const key = path && wanted.length ? JSON.stringify(wanted) : null

  const lanes = useFetch(
    key,
    async (signal) => {
      const values = await getLanes(
        wanted.map((item) => item.approach),
        signal,
      )
      const byInstruction = new Map<number, Lane[]>()
      values.forEach((value, i) => {
        const { index } = wanted[i]
        const parsed = value && parseLanes(value, path!.instructions[index].sign)
        if (parsed) byInstruction.set(index, parsed)
      })
      return byInstruction
    },
    () => '',
  )

  return lanes.status === 'ready' ? lanes.data : NO_LANES
}

const NO_LANES = new Map<number, Lane[]>()
