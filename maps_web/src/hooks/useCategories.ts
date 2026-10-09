import { useEffect, useState } from 'react'
import { getCategories } from '../api/browse'
import type { Category } from '../types'

/** What can be browsed ("Cafes", "Pharmacies", ...). Empty until the backend answers. */
export function useCategories(): Category[] {
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => {
        // Backend down: search still works, just without categories
      })
  }, [])

  return categories
}

/** Categories that match what's been typed, e.g. "coff" -> Cafes. */
export function matchCategories(categories: Category[], text: string): Category[] {
  const typed = text.trim().toLowerCase()
  if (typed.length < 3) return []
  return categories
    .filter((category) =>
      [category.label, ...category.words].some((word) => word.toLowerCase().startsWith(typed)),
    )
    .slice(0, 2)
}
