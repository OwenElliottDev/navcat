import { useEffect, useLayoutEffect, useRef } from 'react'
import './ContextMenu.css'

export type MenuAction = 'from' | 'to' | 'what' | 'add'

const ITEMS: { action: MenuAction; label: string }[] = [
  { action: 'from', label: 'Directions from here' },
  { action: 'to', label: 'Directions to here' },
  { action: 'what', label: "What's here?" },
  { action: 'add', label: 'Add a place here' },
]

const EDGE_GAP = 8

interface ContextMenuProps {
  x: number
  y: number
  onSelect: (action: MenuAction) => void
  onClose: () => void
}

export function ContextMenu({ x, y, onSelect, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLUListElement>(null)

  // Keep the menu on screen and move focus into it
  useLayoutEffect(() => {
    const menu = ref.current!
    menu.style.left = `${Math.min(x, window.innerWidth - menu.offsetWidth - EDGE_GAP)}px`
    menu.style.top = `${Math.min(y, window.innerHeight - menu.offsetHeight - EDGE_GAP)}px`
    menu.querySelector('button')?.focus()
  }, [x, y])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <ul ref={ref} className="context-menu" role="menu">
      {ITEMS.map(({ action, label }) => (
        <li key={action}>
          <button
            type="button"
            role="menuitem"
            className="context-menu__item"
            onClick={() => onSelect(action)}
          >
            {label}
          </button>
        </li>
      ))}
    </ul>
  )
}
