import type { Shortcut } from '../components/PlaceInput'
import type { Category, Recent, SavedPlace } from '../types'

// Dropdown entries for the search and directions boxes

const SAVED_ICONS = { home: 'home', work: 'work', favourite: 'saved' } as const

export function savedPlaceShortcut(place: SavedPlace, onSelect: () => void): Shortcut {
  return {
    key: `saved-${place.id}`,
    label: place.label,
    detail: place.kind === 'favourite' ? place.address : place.name,
    icon: SAVED_ICONS[place.kind],
    onSelect,
  }
}

export function recentShortcut(recent: Recent, onSelect: () => void): Shortcut {
  return {
    key: `recent-${recent.searchedAt}-${recent.query}`,
    label: recent.place?.name ?? recent.query,
    detail: recent.place?.address ?? (recent.category ? 'Search this area' : null),
    icon: recent.category ? 'category' : 'recent',
    onSelect,
  }
}

export function categoryShortcut(category: Category, onSelect: () => void): Shortcut {
  return {
    key: `category-${category.id}`,
    label: category.label,
    detail: 'Search this area',
    icon: 'category',
    onSelect,
  }
}
