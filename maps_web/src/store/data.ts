import type { StateCreator } from 'zustand'
import type { BrowseState } from '../hooks/useBrowse'
import { KNOWN_ROUTING, type Profiles } from '../hooks/useCapabilities'
import type { RouteState } from '../hooks/useRoute'
import type { TransitPlanState } from '../hooks/useTransitPlan'
import type { Category } from '../types'
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
}

export const createDataSlice: StateCreator<Store, [], [], DataSlice> = () => ({
  routing: KNOWN_ROUTING,
  categories: [],
  moveCount: 0,
  route: { status: 'idle' },
  transitModes: [],
  transitPlan: { status: 'idle' },
  browseResults: { status: 'idle' },
})
