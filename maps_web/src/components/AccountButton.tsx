import { useRef, useState } from 'react'
import { useAccount } from '../account/AccountContext'
import { useClickOutside } from '../hooks/useClickOutside'
import { Icon } from './icons'
import './AccountButton.css'

/** "Sign in" when signed out; your initial and a small menu when signed in. */
export function AccountButton() {
  const { user, requestSignIn, signOut, deleteAccount, clearRecents } = useAccount()
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, isOpen, () => setIsOpen(false))

  if (!user) {
    return (
      <button
        type="button"
        className="icon-button"
        aria-label="Sign in"
        title="Sign in"
        onClick={requestSignIn}
      >
        <Icon name="user" />
      </button>
    )
  }

  function run(action: () => unknown) {
    setIsOpen(false)
    action()
  }

  return (
    <div ref={ref} className="account">
      <button
        type="button"
        className="icon-button account__avatar"
        aria-label={`Account: ${user.username}`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        {user.username[0].toUpperCase()}
      </button>

      {isOpen && (
        <div className="account__menu" role="menu">
          <p className="account__name">{user.username}</p>
          <button
            type="button"
            role="menuitem"
            className="account__item"
            onClick={() => run(clearRecents)}
          >
            Clear search history
          </button>
          <button
            type="button"
            role="menuitem"
            className="account__item"
            onClick={() => run(signOut)}
          >
            Sign out
          </button>
          <button
            type="button"
            role="menuitem"
            className="account__item account__item--danger"
            onClick={() =>
              run(() => {
                if (
                  confirm(
                    'Delete your account, saved places and search history? This can’t be undone.',
                  )
                ) {
                  deleteAccount()
                }
              })
            }
          >
            Delete account
          </button>
        </div>
      )}
    </div>
  )
}
