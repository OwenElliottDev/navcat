import { useEffect, useState } from 'react'

export interface TerrainInfo {
  /** Most detailed zoom the elevation tiles were built to */
  maxzoom: number
  /** Changes with every rebuild; added to tile URLs so browsers fetch new tiles */
  source?: string
}

/** Details of the locally built terrain tiles, or null if terrain-build hasn't been run. */
export function useTerrainInfo(): TerrainInfo | null {
  const [info, setInfo] = useState<TerrainInfo | null>(null)

  useEffect(() => {
    fetch('/terrain/info.json')
      .then((response) => (response.ok ? response.json() : null))
      .then(setInfo)
      .catch(() => {
        // No terrain: the topo map isn't offered
      })
  }, [])

  return info
}
