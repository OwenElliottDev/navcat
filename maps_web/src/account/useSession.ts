import { useCallback, useEffect, useState } from 'react'
import * as api from '../api/account'
import type { User } from '../types'

/** Who's signed in. `ready` is false until the first check finishes. */
export function useSession() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api
      .getMe()
      .then(setUser)
      .catch(() => {
        // Backend down: carry on signed out
      })
      .finally(() => setReady(true))
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    setUser(await api.logIn(username, password))
  }, [])

  const signUp = useCallback(async (username: string, password: string) => {
    setUser(await api.signUp(username, password))
  }, [])

  const signOut = useCallback(async () => {
    await api.logOut()
    setUser(null)
  }, [])

  const deleteAccount = useCallback(async () => {
    await api.deleteAccount()
    setUser(null)
  }, [])

  return { user, ready, signIn, signUp, signOut, deleteAccount }
}
