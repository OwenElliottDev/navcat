import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { useViewportHeight } from '../hooks/useViewportHeight'
import { Icon } from './icons'
import './Sheet.css'

const SNAPS = ['peek', 'low', 'half', 'full'] as const
type Snap = (typeof SNAPS)[number]
/** Peek height for content without a `data-sheet-peek` part */
const PEEK_HEIGHT = 132
/** Space left under the last part shown at peek or low height */
const MARK_GAP = 16
/** How far ahead (ms) a flick carries the sheet when picking where it settles */
const FLICK_MS = 180
/** Pointer movement (px) below which a press counts as a tap */
const TAP_SLOP = 6

interface SheetProps {
  children: ReactNode
  /** When this changes (new content), the sheet opens to its low height again. */
  contentKey: string
  /** The bar a full-height sheet stops under, leaving the same gap as above it */
  topRef: RefObject<HTMLElement | null>
  onClose: () => void
  ref?: Ref<HTMLDivElement>
}

interface Drag {
  startY: number
  startHeight: number
  lastY: number
  lastTime: number
  velocity: number
}

/** Where the content's marked parts end, measured from the top of the sheet */
interface Marks {
  peek: number | null
  low: number | null
  /** Where the whole content ends (the most it has reached, while the content stays the same) */
  end: number
  top: number
}

/**
 * Panel content. On phones, a bottom sheet you drag between peek, low, half and full height;
 * on wider screens, a plain scrolling column inside the side panel.
 *
 * Content marks what shows at peek height with `data-sheet-peek` (e.g. a place's name and
 * type) and at low height with `data-sheet-low` (e.g. its buttons).
 */
export function Sheet({ children, contentKey, topRef, onClose, ref }: SheetProps) {
  const isPhone = useMediaQuery(PHONE_QUERY)
  const viewportHeight = useViewportHeight()
  const [snap, setSnap] = useState<Snap>('low')
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const [marks, setMarks] = useState<Marks>({ peek: null, low: null, end: 0, top: 0 })
  const drag = useRef<Drag | null>(null)
  const contentEl = useRef<HTMLDivElement | null>(null)
  const innerEl = useRef<HTMLDivElement | null>(null)

  // New content opens at low height
  const [lastKey, setLastKey] = useState(contentKey)
  if (contentKey !== lastKey) {
    setLastKey(contentKey)
    setSnap('low')
  }

  // New content starts at its top, which the lower heights are sized for
  useLayoutEffect(() => {
    contentEl.current?.scrollTo({ top: 0 })
  }, [contentKey])

  // Re-measure as the content (e.g. a place's details loading) or the top bar changes size
  useLayoutEffect(() => {
    const content = contentEl.current
    const inner = innerEl.current
    if (!isPhone || !content || !inner) return
    const padding = parseFloat(getComputedStyle(content.parentElement!).paddingBottom) || 0

    /** `keep` holds on to marks the content loses for a moment, e.g. while a route reloads */
    function measure(keep: boolean) {
      const top = topRef.current?.getBoundingClientRect()
      // Where the top of the sheet would be with the content scrolled to the top
      const sheetTop = inner!.getBoundingClientRect().top - content!.offsetTop
      const end = (selector: string) => {
        const parts = [...inner!.querySelectorAll(selector)]
        if (!parts.length) return null
        const bottom = Math.max(...parts.map((part) => part.getBoundingClientRect().bottom))
        return Math.round(bottom - sheetTop + MARK_GAP + padding)
      }
      const peek = end('[data-sheet-peek]')
      const low = end('[data-sheet-low]')
      const all = Math.round(inner!.getBoundingClientRect().bottom - sheetTop + padding)
      setMarks((m) => {
        const next = {
          peek: peek ?? (keep ? m.peek : null),
          low: low ?? (keep ? m.low : null),
          end: keep ? Math.max(all, m.end) : all,
          top: top ? Math.round(top.bottom + top.top) : 0,
        }
        return m.peek === next.peek &&
          m.low === next.low &&
          m.end === next.end &&
          m.top === next.top
          ? m
          : next
      })
    }

    measure(false)
    const observer = new ResizeObserver(() => measure(true))
    observer.observe(inner)
    if (topRef.current) observer.observe(topRef.current)
    return () => observer.disconnect()
  }, [isPhone, topRef, contentKey])

  const full = viewportHeight - marks.top
  const half = Math.min(Math.round(viewportHeight * 0.45), full)
  // Content without a low mark (a list, or a one-line message) shows as much as fits up to half
  const low = Math.min(marks.low ?? marks.end, half)
  const heights: Record<Snap, number> = {
    peek: Math.min(marks.peek ?? PEEK_HEIGHT, low),
    low,
    half,
    full,
  }
  const height = dragHeight ?? heights[snap]

  // Lets map controls (and the "Search this area" button) sit just above the sheet, up to
  // half height; above that the sheet covers them rather than pushing them under the top bar
  const raised = Math.min(height, heights.half)
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--sheet-visible', isPhone ? `${raised}px` : '0px')
    return () => document.documentElement.style.setProperty('--sheet-visible', '0px')
  }, [isPhone, raised])

  if (!isPhone) {
    return (
      <div ref={ref} className="panel__body">
        {children}
      </div>
    )
  }

  function settle(next: Snap) {
    // The lower heights show the top of the content, which is what they're sized for
    if (next === 'peek' || next === 'low') contentEl.current?.scrollTo({ top: 0 })
    setSnap(next)
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
    setDragHeight(Math.min(Math.max(next, heights.peek * 0.6), heights.full))
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
    settle(
      SNAPS.reduce((best, s) =>
        Math.abs(heights[s] - projected) < Math.abs(heights[best] - projected) ? s : best,
      ),
    )
  }

  // A tap steps up through the heights, then back down to low from the top
  const tapSnap =
    SNAPS.slice(SNAPS.indexOf(snap) + 1).find((s) => heights[s] > heights[snap]) ?? 'low'

  function cycleSnap() {
    settle(tapSnap)
  }

  return (
    <div ref={ref} className="sheet glass" style={{ height }} data-dragging={dragHeight !== null}>
      <button
        type="button"
        className="sheet__handle"
        aria-label={heights[tapSnap] > heights[snap] ? 'Expand panel' : 'Shrink panel'}
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
      <button
        type="button"
        className="icon-button sheet__close"
        aria-label="Close"
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
      <div ref={contentEl} className="sheet__content">
        <div ref={innerEl} className="sheet__inner">
          {children}
        </div>
      </div>
    </div>
  )
}
