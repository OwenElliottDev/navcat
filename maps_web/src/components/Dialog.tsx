import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from 'react'
import { Icon } from './icons'
import './Dialog.css'

interface DialogProps {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
  /** Shown as a bottom sheet: slides in and out, with a grip to drag it down and away */
  asSheet?: boolean
}

/** How far down (px) a dialog is dragged before letting go closes it */
const CLOSE_DRAG = 80

/** A modal over everything. Uses <dialog>, so the browser handles focus and Escape. */
export function Dialog({ title, onClose, children, className, asSheet }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const dragStart = useRef<number | null>(null)

  /** A sheet slides away before it closes */
  function dismiss() {
    const dialog = ref.current
    // No transition to wait for with reduced motion
    if (!asSheet || !dialog || parseFloat(getComputedStyle(dialog).transitionDuration) === 0) {
      onClose()
      return
    }
    if (dialog.style.translate === '0 100%') return // already on its way
    dialog.style.translate = '0 100%'
    dialog.addEventListener('transitionend', (e) => e.target === dialog && onClose())
  }

  function moveDrag(e: PointerEvent) {
    if (dragStart.current === null || !ref.current) return
    ref.current.style.translate = `0 ${Math.max(0, e.clientY - dragStart.current)}px`
  }

  function endDrag(e: PointerEvent) {
    if (dragStart.current === null || !ref.current) return
    const dragged = e.clientY - dragStart.current
    dragStart.current = null
    ref.current.dataset.dragging = 'false'
    if (dragged > CLOSE_DRAG) dismiss()
    else ref.current.style.translate = ''
  }

  return (
    <dialog
      ref={ref}
      className={['dialog', asSheet && 'dialog--sheet', className].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
      onClose={onClose}
      // Escape
      onCancel={(e) => {
        e.preventDefault()
        dismiss()
      }}
      // A click on the backdrop lands on the <dialog> itself
      onClick={(e) => e.target === e.currentTarget && dismiss()}
    >
      {asSheet && (
        <div
          className="dialog__grip"
          aria-hidden="true"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            dragStart.current = e.clientY
            ref.current!.dataset.dragging = 'true'
          }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      )}
      <div className="dialog__header">
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={dismiss}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  )
}
