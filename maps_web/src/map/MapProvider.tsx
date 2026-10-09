import { useState, type ReactNode } from 'react'
import type { Map } from 'maplibre-gl'
import { MapContext } from './MapContext'

export function MapProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<Map | null>(null)
  return <MapContext value={{ map, setMap }}>{children}</MapContext>
}
