import { useEffect, useState } from 'react'
import { useMap } from './MapContext'

export function useIsTilted(): boolean {
  const map = useMap()
  const [isTilted, setIsTilted] = useState(false)

  useEffect(() => {
    if (!map) return
    const update = () => setIsTilted(map.getPitch() > 1)
    update()
    map.on('pitch', update)
    return () => {
      map.off('pitch', update)
    }
  }, [map])

  return isTilted
}
