import { useState, type FormEvent } from 'react'
import { useAccount } from '../account/AccountContext'
import { apiErrorMessage } from '../api/http'
import { Dialog } from './Dialog'

type Mode = 'signIn' | 'signUp'

const INVALID_SIGN_UP =
  'Usernames are 3–40 letters, numbers, dots, dashes or underscores. Passwords need at least 8 characters.'

/** Sign in, or create an account. */
export function SignInDialog({ onClose }: { onClose: () => void }) {
  const { signIn, signUp } = useAccount()
  const [mode, setMode] = useState<Mode>('signIn')
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const username = String(form.get('username'))
    const password = String(form.get('password'))

    setIsBusy(true)
    setError(null)
    try {
      await (mode === 'signIn' ? signIn(username, password) : signUp(username, password))
      onClose()
    } catch (err) {
      const fallback = mode === 'signUp' ? INVALID_SIGN_UP : "Couldn't sign in. Try again."
      setError(apiErrorMessage(err, fallback))
    } finally {
      setIsBusy(false)
    }
  }

  const isSignIn = mode === 'signIn'
  return (
    <Dialog title={isSignIn ? 'Sign in' : 'Create an account'} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit}>
        <p className="note">
          Keep saved places and recent searches on every device, and add reviews and photos.
        </p>

        <label className="form__field">
          Username
          <input name="username" autoComplete="username" required autoFocus />
        </label>
        <label className="form__field">
          Password
          <input
            name="password"
            type="password"
            autoComplete={isSignIn ? 'current-password' : 'new-password'}
            minLength={isSignIn ? undefined : 8}
            required
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="form__actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={isBusy}>
            {isSignIn ? 'Sign in' : 'Create account'}
          </button>
        </div>

        <button
          type="button"
          className="link-button"
          onClick={() => {
            setMode(isSignIn ? 'signUp' : 'signIn')
            setError(null)
          }}
        >
          {isSignIn ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </Dialog>
  )
}
