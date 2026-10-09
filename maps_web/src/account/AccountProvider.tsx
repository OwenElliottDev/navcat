import { useState, type ReactNode } from 'react'
import { SignInDialog } from '../components/SignInDialog'
import { AccountContext, type Account } from './AccountContext'
import { useRecentsStore } from './useRecentsStore'
import { useSavedPlacesStore } from './useSavedPlacesStore'
import { useSession } from './useSession'

/** Everything personal: who's signed in, their recent searches and saved places. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const { ready, ...session } = useSession()
  const recents = useRecentsStore(session.user, ready)
  const saved = useSavedPlacesStore(session.user)
  const [isSigningIn, setIsSigningIn] = useState(false)

  const account: Account = {
    ...session,
    ...recents,
    ...saved,
    requestSignIn: () => setIsSigningIn(true),
  }

  return (
    <AccountContext value={account}>
      {children}
      {isSigningIn && <SignInDialog onClose={() => setIsSigningIn(false)} />}
    </AccountContext>
  )
}
