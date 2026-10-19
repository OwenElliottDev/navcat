import type { StateCreator } from 'zustand'
import type { BrowseState } from '../hooks/useBrowse'
import { KNOWN_ROUTING, type Profiles } from '../hooks/useProfiles'
import type { RouteState } from '../hooks/useRoute'
import type { TransitPlanState } from '../hooks/useTransitPlan'
import type { Category, RouteSegment } from '../types'
import type { NavRoute } from '../utils/navigation'
import type { Store } from '.'

/** What's been fetched for the other slices' choices; kept up to date by TripData. */
export interface DataSlice {
  routing: Profiles
  categories: Category[]
  /** How many times the map has finished moving */
  moveCount: number
  route: RouteState
  transitModes: string[]
  transitPlan: TransitPlanState
  browseResults: BrowseState
  /** The route or journey shown, as lines to draw */
  routeSegments: RouteSegment[]
  /** The route or journey shown, ready to follow */
  navRoute: NavRoute | null
}

export const createDataSlice: StateCreator<Store, [], [], DataSlice> = () => ({
  routing: KNOWN_ROUTING,
  categories: [],
  moveCount: 0,
  route: { status: 'idle' },
  transitModes: [],
  transitPlan: { status: 'idle' },
  browseResults: { status: 'idle' },
  routeSegments: [],
  navRoute: null,
})
