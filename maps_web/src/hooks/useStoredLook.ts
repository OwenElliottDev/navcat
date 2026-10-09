import { useState } from 'react'
import { BASE_MAPS, OVERLAYS, ROAD_LABELS, type MapLook } from '../map/mapStyles'

const STORAGE_KEY = 'maps.look'

/** Dark map when the device is in dark mode, otherwise the standard one */
function defaultLook(): MapLook {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return { base: prefersDark ? 'dark' : 'standard', overlays: [], roadLabels: 'names' }
}

function loadLook(): MapLook {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    // Ignore anything that's no longer a valid choice
    if (BASE_MAPS.some((b) => b.id === stored?.base) && Array.isArray(stored.overlays)) {
      return {
        base: stored.base,
        overlays: stored.overlays.filter((o: string) => OVERLAYS.some((x) => x.id === o)),
        roadLabels: ROAD_LABELS.some((r) => r.id === stored.roadLabels)
          ? stored.roadLabels
          : 'names',
      }
    }
  } catch {
    // Storage blocked: use the default
  }
  return defaultLook()
}

/** The chosen map type and overlays, remembered on this device. */
export function useStoredLook(): [MapLook, (look: MapLook) => void] {
  const [look, setLook] = useState(loadLook)

  function update(next: MapLook) {
    setLook(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage blocked: the choice just won't be remembered
    }
  }

  return [look, update]
}
