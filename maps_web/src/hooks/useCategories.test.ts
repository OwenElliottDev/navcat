import { describe, expect, it } from 'vitest'
import type { Category } from '../types'
import { matchCategories } from './useCategories'

const category = (id: string, label: string, words: string[] = []): Category => ({
  id,
  label,
  words,
  osmValues: [id],
})
const categories = [
  category('cafe', 'Cafes', ['coffee', 'coffee shop']),
  category('cinema', 'Cinemas', ['movies']),
  category('cash', 'Cash points'),
  category('restaurant', 'Restaurants', ['food']),
]

describe('matchCategories', () => {
  it('matches the start of a label or word, ignoring case', () => {
    expect(matchCategories(categories, ' COFF').map((c) => c.id)).toEqual(['cafe'])
    expect(matchCategories(categories, 'mov').map((c) => c.id)).toEqual(['cinema'])
  })

  it('waits for three letters and suggests at most two', () => {
    expect(matchCategories(categories, 'ca')).toEqual([])
    expect(matchCategories(categories, 'caf')).toHaveLength(1)
    expect(matchCategories([...categories, category('cafe2', 'Cafeterias')], 'caf')).toHaveLength(2)
  })
})
