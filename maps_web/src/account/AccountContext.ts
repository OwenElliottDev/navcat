import { createContext, useContext } from 'react'
import type { NewSavedPlace, Recent, RecentSearch, SavedPlace, User } from '../types'

export interface Account {
  /** null when signed out */
  user: User | null
  signIn: (username: string, password: string) => Promise<void>
  signUp: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>
  /** Opens the sign-in dialog, e.g. when a signed-out user tries to save a place. */
  requestSignIn: () => void

  /** Newest first. Kept in this browser when signed out, with the account when signed in. */
  recents: Recent[]
  addRecent: (search: RecentSearch) => void
  clearRecents: () => void

  /** Home, then Work, then favourites. Empty when signed out. */
  savedPlaces: SavedPlace[]
  savePlace: (place: NewSavedPlace) => Promise<void>
  removePlace: (id: number) => Promise<void>
}

export const AccountContext = createContext<Account | null>(null)

export function useAccount(): Account {
  const account = useContext(AccountContext)
  if (!account) throw new Error('useAccount must be used inside <AccountProvider>')
  return account
}
