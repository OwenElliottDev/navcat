import { create } from 'zustand'
import type { Camera } from '../map/useCamera'
import { createDataSlice, type DataSlice } from './data'
import { createDirectionsSlice, type DirectionsSlice } from './directions'
import { createNavigationSlice, type NavigationSlice } from './navigation'
import { createViewSlice, type ViewSlice } from './view'

export interface Store extends ViewSlice, DirectionsSlice, NavigationSlice, DataSlice {
  /** Moves the map; set by App once the map exists */
  camera: Camera | null
}

export const useAppStore = create<Store>()((...args) => ({
  camera: null,
  ...createViewSlice(...args),
  ...createDirectionsSlice(...args),
  ...createNavigationSlice(...args),
  ...createDataSlice(...args),
}))
