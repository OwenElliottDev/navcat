import { useCopy } from '../hooks/useCopy'
import { Icon } from './icons'

/** Copies `text`, showing a tick for a moment afterwards. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const { copy, icon, title, message } = useCopy(label)

  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label={`Copy ${label}`}
        title={title}
        onClick={() => copy(text)}
      >
        <Icon name={icon} />
      </button>
      <span className="sr-only" aria-live="polite">
        {message}
      </span>
    </>
  )
}
