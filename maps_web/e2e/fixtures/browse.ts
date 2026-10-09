import { POI_DETAILS } from './places'

// /api/browse/categories: a few of maps_backend/app/categories.py
export const CATEGORIES = [
  { id: 'cafe', label: 'Cafes', words: ['coffee', 'coffee shop', 'espresso'], osmValues: ['cafe'] },
  { id: 'restaurant', label: 'Restaurants', words: ['food', 'dinner'], osmValues: ['restaurant'] },
  { id: 'supermarket', label: 'Groceries', words: ['grocery'], osmValues: ['supermarket'] },
  { id: 'pharmacy', label: 'Pharmacies', words: ['chemist'], osmValues: ['pharmacy', 'chemist'] },
  { id: 'bar', label: 'Bars & pubs', words: ['pubs', 'beer'], osmValues: ['bar', 'pub'] },
  { id: 'toilets', label: 'Toilets', words: ['bathroom'], osmValues: ['toilets'] },
]

/** /api/browse results for a category, nearest first */
export function browseResults(category: string) {
  const values = CATEGORIES.find((c) => c.id === category)?.osmValues ?? []
  const results = Object.values(POI_DETAILS)
    .filter((poi) => values.includes(poi.category))
    .map((poi, i) => ({ ...poi, distance: 120 + i * 230 }))
  return { results, truncated: false }
}
