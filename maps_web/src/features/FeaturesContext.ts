import { createContext, useContext } from 'react'
import type { Features } from '../types'

// Until the server answers (or if it can't), everything optional stays off
export const NO_FEATURES: Features = {
  allowPlaceEdits: false,
  allowReviews: false,
  allowPhotos: false,
}

export const FeaturesContext = createContext<Features>(NO_FEATURES)

export function useFeatures(): Features {
  return useContext(FeaturesContext)
}
