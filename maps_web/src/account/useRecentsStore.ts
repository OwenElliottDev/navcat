import { useCallback, useEffect, useState } from 'react'
import * as api from '../api/account'
import type { Recent, RecentSearch, User } from '../types'
import { loadLocalRecents, saveLocalRecents, withRecent } from './localRecents'

const NO_RECENTS: Recent[] = []

/**
 * Recent searches: in this browser when signed out, with the account when signed in.
 * Signing in moves anything searched while signed out into the account.
 */
export function useRecentsStore(user: User | null, ready: boolean) {
  const userId = user?.id ?? null
  const [local, setLocal] = useState<Recent[]>(loadLocalRecents)
  // Tagged with whose they are, so they're never shown to anyone else
  const [server, setServer] = useState<{ userId: number; recents: Recent[] } | null>(null)

  const recents = userId === null ? local : server?.userId === userId ? server.recents : NO_RECENTS

  useEffect(() => {
    if (!ready || userId === null) return

    let cancelled = false
    const toImport = loadLocalRecents()
    // Oldest first, so the newest ends up on top
    const sync = toImport.length ? api.addRecents(toImport.toReversed()) : api.getRecents()
    sync
      .then((list) => {
        if (cancelled) return
        if (toImport.length) {
          saveLocalRecents([])
          setLocal([])
        }
        setServer({ userId, recents: list })
      })
      .catch(() => {
        // Keep whatever we were showing
      })
    return () => {
      cancelled = true
    }
  }, [userId, ready])

  const addRecent = useCallback(
    (search: RecentSearch) => {
      if (userId === null) {
        setLocal((prev) => {
          const next = withRecent(prev, search)
          saveLocalRecents(next)
          return next
        })
        return
      }
      // Show it straight away, then take the server's list
      setServer((prev) => prev && { ...prev, recents: withRecent(prev.recents, search) })
      api.addRecents([search]).then(
        (list) => setServer({ userId, recents: list }),
        () => {},
      )
    },
    [userId],
  )

  const clearRecents = useCallback(() => {
    if (userId === null) {
      setLocal([])
      saveLocalRecents([])
    } else {
      setServer({ userId, recents: [] })
      api.clearRecents().catch(() => {})
    }
  }, [userId])

  return { recents, addRecent, clearRecents }
}
