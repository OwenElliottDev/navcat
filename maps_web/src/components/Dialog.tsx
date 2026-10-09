import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Icon } from './icons'
import './Dialog.css'

interface DialogProps {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}

/** A modal over everything. Uses <dialog>, so the browser handles focus and Escape. */
export function Dialog({ title, onClose, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className={['dialog', className].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> itself
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="dialog__header">
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  )
}
