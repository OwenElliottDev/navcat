import { useEffect, useState } from 'react'

/** How far the mouse moves before a press becomes a drag rather than a click */
const DRAG_THRESHOLD = 5

/**
 * Lets a row that scrolls sideways (with its scrollbar hidden) scroll on desktop too: the mouse
 * wheel scrolls it sideways, and it can be dragged with the mouse. Touch already swipes it.
 * Returns a ref callback, so it works on rows that only show up later.
 */
export function useSideScroll<T extends HTMLElement>() {
  const [row, setRow] = useState<T | null>(null)

  useEffect(() => {
    if (!row) return
    const canScroll = () => row.scrollWidth > row.clientWidth

    const onWheel = (e: WheelEvent) => {
      // Trackpads already scroll sideways; only turn up-and-down wheels into sideways
      if (!canScroll() || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
      // At the end the row can't move, so let the wheel scroll the page instead
      const end = row.scrollWidth - row.clientWidth
      if (e.deltaY < 0 ? row.scrollLeft <= 0 : row.scrollLeft >= end - 1) return
      e.preventDefault()
      row.scrollLeft += e.deltaY
    }

    let start: { x: number; scrollLeft: number } | null = null
    let dragged = false

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !canScroll()) return
      start = { x: e.clientX, scrollLeft: row.scrollLeft }
      dragged = false
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!start) return
      const moved = e.clientX - start.x
      if (!dragged && Math.abs(moved) < DRAG_THRESHOLD) return
      dragged = true
      row.scrollLeft = start.scrollLeft - moved
    }
    const onPointerUp = () => {
      if (!start) return
      start = null
      // The click from this release (if it lands on the row) comes first; a drag released
      // elsewhere mustn't swallow a later click
      if (dragged) setTimeout(() => (dragged = false))
    }
    // A drag that ends on a chip shouldn't also press it
    const onClick = (e: MouseEvent) => {
      if (!dragged) return
      e.preventDefault()
      e.stopPropagation()
    }

    row.addEventListener('wheel', onWheel, { passive: false })
    row.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    row.addEventListener('click', onClick, true)
    return () => {
      row.removeEventListener('wheel', onWheel)
      row.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      row.removeEventListener('click', onClick, true)
    }
  }, [row])

  return setRow
}
