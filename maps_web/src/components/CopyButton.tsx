import { useEffect, useState } from 'react'
import { copyText } from '../utils/clipboard'
import { Icon } from './icons'

type State = 'idle' | 'copied' | 'failed'

/** Copies `text`, showing a tick for a moment afterwards. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<State>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = setTimeout(() => setState('idle'), 1500)
    return () => clearTimeout(timer)
  }, [state])

  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label={`Copy ${label}`}
        title={state === 'failed' ? 'Couldn’t copy' : `Copy ${label}`}
        onClick={() =>
          copyText(text).then(
            () => setState('copied'),
            () => setState('failed'),
          )
        }
      >
        <Icon name={state === 'copied' ? 'check' : 'copy'} />
      </button>
      <span className="sr-only" aria-live="polite">
        {state === 'copied' ? `${label} copied` : state === 'failed' ? 'Couldn’t copy' : ''}
      </span>
    </>
  )
}
