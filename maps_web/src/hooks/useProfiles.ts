import { useEffect, useState } from 'react'
import { getRoutingInfo } from '../api/routing'
import { CAR_AVOIDS, PROFILE_LABELS, STEEP_HILLS, TRANSIT_PROFILE, type CarAvoid } from '../config'

// Used until GraphHopper answers (it can take a while to start)
const KNOWN_PROFILES = Object.keys(PROFILE_LABELS)

/** Puts the modes we have labels for first, in our order; anything else after. */
function rank(name: string): number {
  const index = KNOWN_PROFILES.indexOf(name)
  return index === -1 ? KNOWN_PROFILES.length : index
}

export interface Profiles {
  /** Travel modes: GraphHopper's own profiles, plus public transport */
  profiles: string[]
  /** What drives can avoid, given what the routing graph knows about roads */
  carAvoids: CarAvoid[]
  /** Whether walks and rides can avoid steep hills (the routing graph knows how steep roads are) */
  steepHills: boolean
}

const ALL_CAR_AVOIDS = Object.keys(CAR_AVOIDS) as CarAvoid[]

/** Travel modes and their options, from what GraphHopper is set up with. */
export function useProfiles(): Profiles {
  const [info, setInfo] = useState<Profiles>({
    profiles: KNOWN_PROFILES,
    carAvoids: [],
    steepHills: false,
  })

  useEffect(() => {
    getRoutingInfo()
      .then(({ profiles, encodedValues }) => {
        if (!profiles.length) return
        setInfo({
          profiles: [...profiles, TRANSIT_PROFILE].toSorted((a, b) => rank(a) - rank(b)),
          carAvoids: ALL_CAR_AVOIDS.filter((name) =>
            encodedValues.includes(CAR_AVOIDS[name].needs),
          ),
          steepHills: encodedValues.includes(STEEP_HILLS.needs),
        })
      })
      .catch(() => {
        // Keep the known modes
      })
  }, [])

  return info
}
