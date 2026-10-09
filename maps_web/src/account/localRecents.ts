import type { Recent, RecentSearch } from '../types'

// Recent searches for signed-out users. They never leave this browser.

const STORAGE_KEY = 'maps.recents'
export const MAX_RECENTS = 20

export function loadLocalRecents(): Recent[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

export function saveLocalRecents(recents: Recent[]) {
  try {
    if (recents.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(recents))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked (private mode): history just won't persist
  }
}

/** Matches the backend's rule for when two searches are the same search. */
function searchKey(search: RecentSearch): string {
  const { place } = search
  if (place?.osmType && place.osmId) return `osm:${place.osmType}${place.osmId}`
  if (place) return `at:${place.lng.toFixed(5)},${place.lat.toFixed(5)}`
  if (search.category) return `category:${search.category}`
  return `query:${search.query.trim().toLowerCase()}`
}

/** Puts `search` at the top, removing an older copy of it. */
export function withRecent(recents: Recent[], search: RecentSearch): Recent[] {
  const key = searchKey(search)
  const others = recents.filter((recent) => searchKey(recent) !== key)
  return [{ ...search, searchedAt: new Date().toISOString() }, ...others].slice(0, MAX_RECENTS)
}
