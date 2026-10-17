import { useEffect, useLayoutEffect, useRef, type ComponentProps } from 'react'
import { useCopy } from '../hooks/useCopy'
import type { LngLat } from '../types'
import { coordLabel } from '../utils/format'
import { Icon, type IconName } from './icons'
import './ContextMenu.css'

export type MenuAction = 'from' | 'to' | 'what' | 'add'

// Labels end in an ellipsis when the item asks for more input before it's done
const ITEMS: { action: MenuAction; label: string; icon: IconName }[] = [
  { action: 'from', label: 'Directions from here', icon: 'start' },
  { action: 'to', label: 'Directions to here', icon: 'directions' },
  { action: 'what', label: "What's here?", icon: 'search' },
  { action: 'add', label: 'Add a place here…', icon: 'pin' },
]

const EDGE_GAP = 8

interface ContextMenuProps {
  x: number
  y: number
  /** Where on the map the menu was opened; shown last, and copied when picked */
  position: LngLat
  onSelect: (action: MenuAction) => void
  onClose: () => void
}

export function ContextMenu({ x, y, position, onSelect, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLUListElement>(null)
  const { copy, icon, title, message } = useCopy('coordinates')
  const coords = coordLabel(position)

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
      {ITEMS.map(({ action, label, icon }) => (
        <li key={action}>
          <button
            type="button"
            role="menuitem"
            className="row context-menu__item"
            onClick={() => onSelect(action)}
          >
            <Icon name={icon} />
            {label}
          </MenuItem>
        ))}
        <MenuItem
          icon={icon}
          aria-label={`Copy coordinates ${coords}`}
          title={title}
          onClick={() => copy(coords)}
        >
          {coords}
        </MenuItem>
      </ul>
      <span className="sr-only" aria-live="polite">
        {message}
      </span>
    </>
  )
}

function MenuItem({ icon, children, ...props }: { icon?: IconName } & ComponentProps<'button'>) {
  return (
    <li role="none">
      <button type="button" role="menuitem" className="row context-menu__item" {...props}>
        {icon && <Icon name={icon} />}
        {children}
      </button>
    </li>
  )
}
