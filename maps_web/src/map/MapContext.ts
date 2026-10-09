import { createContext, useContext } from 'react'
import type { Map } from 'maplibre-gl'

interface MapContextValue {
  map: Map | null
  setMap: (map: Map | null) => void
}

export const MapContext = createContext<MapContextValue>({ map: null, setMap: () => {} })

/** The map once its style has loaded, or null before then. */
export function useMap(): Map | null {
  return useContext(MapContext).map
}
