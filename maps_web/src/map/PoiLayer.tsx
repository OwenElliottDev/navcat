import { useEffect } from 'react'
import type { Poi } from '../types'
import { useMap } from './MapContext'
import { setPois } from './poiLayers'

export function PoiLayer({ pois, selectedKey }: { pois: Poi[]; selectedKey: string | null }) {
  const map = useMap()

  useEffect(() => {
    if (map) setPois(map, pois, selectedKey)
  }, [map, pois, selectedKey])

  return null
}
