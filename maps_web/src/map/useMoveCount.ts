import { useEffect, useState } from 'react'
import { useMap } from './MapContext'

/** How many times the map has finished moving; compare two values to tell if the view changed. */
export function useMoveCount(): number {
  const map = useMap()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!map) return
    const onMoveEnd = () => setCount((n) => n + 1)
    map.on('moveend', onMoveEnd)
    return () => {
      map.off('moveend', onMoveEnd)
    }
  }, [map])

  return count
}
