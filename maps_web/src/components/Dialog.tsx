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
  const isClosing = useRef(false)

  /** A sheet slides away before it closes. Closed with close(), so focus goes back to the opener */
  function dismiss() {
    const dialog = ref.current
    if (!dialog || isClosing.current) return
    if (!asSheet || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialog.close()
      return
    }
    isClosing.current = true
    // An animation rather than a transition, so it also takes over from the sliding in
    dialog
      .animate([{ translate: getComputedStyle(dialog).translate }, { translate: '0 100%' }], {
        duration: 250,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        fill: 'forwards',
      })
      .finished.then(
        () => dialog.close(),
        () => {}, // cancelled by unmounting
      )
  }

  function startDrag(e: PointerEvent) {
    if (!ref.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStart.current = e.clientY
    ref.current.dataset.dragging = 'true'
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
      // A click on the backdrop lands on the <dialog> itself, as does one on its padding
      onClick={(e) => {
        if (e.target !== e.currentTarget) return
        const box = e.currentTarget.getBoundingClientRect()
        const inside =
          e.clientX >= box.left &&
          e.clientX <= box.right &&
          e.clientY >= box.top &&
          e.clientY <= box.bottom
        if (!inside) dismiss()
      }}
    >
      {asSheet && (
        <div
          className="dialog__grip"
          aria-hidden="true"
          onPointerDown={startDrag}
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
