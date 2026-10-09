import { useCallback, useEffect, useState } from 'react'
import * as api from '../api/account'
import type { NewSavedPlace, SavedPlace, User } from '../types'

const NO_PLACES: SavedPlace[] = []

/** Saved places for the signed-in user (none when signed out). */
export function useSavedPlacesStore(user: User | null) {
  const userId = user?.id ?? null
  // Tagged with whose they are, so a different (or no) user never sees them
  const [loaded, setLoaded] = useState<{ userId: number; places: SavedPlace[] } | null>(null)
  const savedPlaces = loaded && loaded.userId === userId ? loaded.places : NO_PLACES

  const reload = useCallback(async () => {
    if (userId === null) return
    setLoaded({ userId, places: await api.getSavedPlaces() })
  }, [userId])

  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    api.getSavedPlaces().then(
      (places) => {
        if (!cancelled) setLoaded({ userId, places })
      },
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [userId])

  const savePlace = useCallback(
    async (place: NewSavedPlace) => {
      await api.savePlace(place)
      await reload()
    },
    [reload],
  )

  const removePlace = useCallback(async (id: number) => {
    await api.deleteSavedPlace(id)
    setLoaded((prev) => prev && { ...prev, places: prev.places.filter((place) => place.id !== id) })
  }, [])

  return { savedPlaces, savePlace, removePlace }
}
