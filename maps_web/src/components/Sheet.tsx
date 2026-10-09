import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { useViewportHeight } from '../hooks/useViewportHeight'
import './Sheet.css'

type Snap = 'peek' | 'half' | 'full'

const PEEK_HEIGHT = 132
/** Room left above a full-height sheet, so you can still see you're on a map */
const FULL_GAP = 88
/** How far ahead (ms) a flick carries the sheet when picking where it settles */
const FLICK_MS = 180
/** Pointer movement (px) below which a press counts as a tap */
const TAP_SLOP = 6

interface SheetProps {
  children: ReactNode
  /** When this changes (new content), the sheet opens to half height again. */
  contentKey: string
  ref?: Ref<HTMLDivElement>
}

interface Drag {
  startY: number
  startHeight: number
  lastY: number
  lastTime: number
  velocity: number
}

/**
 * Panel content. On phones, a bottom sheet you drag between peek, half and full height;
 * on wider screens, a plain scrolling column inside the side panel.
 */
export function Sheet({ children, contentKey, ref }: SheetProps) {
  const isPhone = useMediaQuery(PHONE_QUERY)
  const viewportHeight = useViewportHeight()
  const [snap, setSnap] = useState<Snap>('half')
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const drag = useRef<Drag | null>(null)

  // New content opens at half height
  const [lastKey, setLastKey] = useState(contentKey)
  if (contentKey !== lastKey) {
    setLastKey(contentKey)
    setSnap('half')
  }

  const heights: Record<Snap, number> = {
    peek: PEEK_HEIGHT,
    half: Math.round(viewportHeight * 0.45),
    full: viewportHeight - FULL_GAP,
  }
  const height = dragHeight ?? heights[snap]

  // Lets map controls (and the "Search this area" button) sit just above the sheet
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--sheet-visible', isPhone ? `${height}px` : '0px')
    return () => document.documentElement.style.setProperty('--sheet-visible', '0px')
  }, [isPhone, height])

  if (!isPhone) {
    return (
      <div ref={ref} className="panel__body">
        {children}
      </div>
    )
  }

  function startDrag(e: PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      startY: e.clientY,
      startHeight: height,
      lastY: e.clientY,
      lastTime: e.timeStamp,
      velocity: 0,
    }
  }

  function moveDrag(e: PointerEvent) {
    const d = drag.current
    if (!d) return
    const elapsed = e.timeStamp - d.lastTime
    if (elapsed > 0) d.velocity = (d.lastY - e.clientY) / elapsed // px/ms, positive = upwards
    d.lastY = e.clientY
    d.lastTime = e.timeStamp
    const next = d.startHeight + (d.startY - e.clientY)
    setDragHeight(Math.min(Math.max(next, PEEK_HEIGHT * 0.6), heights.full))
  }

  function endDrag() {
    const d = drag.current
    if (!d) return
    drag.current = null
    setDragHeight(null)

    // A tap steps through the heights instead
    if (Math.abs(d.lastY - d.startY) < TAP_SLOP) {
      cycleSnap()
      return
    }
    // Settle at the height nearest to where the flick was heading
    const projected = height + d.velocity * FLICK_MS
    const nearest = (Object.keys(heights) as Snap[]).reduce((best, s) =>
      Math.abs(heights[s] - projected) < Math.abs(heights[best] - projected) ? s : best,
    )
    setSnap(nearest)
  }

  function cycleSnap() {
    setSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'half')
  }

  return (
    <div ref={ref} className="sheet glass" style={{ height }} data-dragging={dragHeight !== null}>
      <button
        type="button"
        className="sheet__handle"
        aria-label={snap === 'full' ? 'Shrink panel' : 'Expand panel'}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={(e) => {
          // Keyboard (Enter/Space); pointer taps are handled in endDrag
          if (e.detail === 0) cycleSnap()
        }}
      >
        <span className="sheet__grip" />
      </button>
      <div className="sheet__content">{children}</div>
    </div>
  )
}
