import { useSideScroll } from '../hooks/useSideScroll'
import type { Category } from '../types'
import './CategoryChips.css'

/** The most-used categories to start browsing with */
const QUICK_CATEGORIES = [
  'cafe',
  'restaurant',
  'supermarket',
  'fuel',
  'pharmacy',
  'park',
  'bar',
  'toilets',
]

interface CategoryChipsProps {
  categories: Category[]
  /** The category being browsed, if any */
  activeId: string | null
  onSelect: (category: Category) => void
}

/** One-tap browsing under the search bar, scrolling sideways on narrow screens. */
export function CategoryChips({ categories, activeId, onSelect }: CategoryChipsProps) {
  const rowRef = useSideScroll<HTMLDivElement>()
  const quick = QUICK_CATEGORIES.flatMap((id) =>
    categories.filter((category) => category.id === id),
  )
  if (!quick.length) return null

  return (
    <div ref={rowRef} className="category-chips" role="group" aria-label="Browse nearby">
      {quick.map((category) => (
        <button
          key={category.id}
          type="button"
          className="chip"
          aria-pressed={category.id === activeId}
          onClick={() => onSelect(category)}
        >
          {category.label}
        </button>
      ))}
    </div>
  )
}
