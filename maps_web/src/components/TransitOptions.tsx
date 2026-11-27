import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useClickOutside } from '../hooks/useClickOutside'
import type { TripTime } from '../types'
import { formatDateTime } from '../utils/format'
import { transitModeLabel } from '../utils/transitModes'
import { Icon } from './icons'
import './TransitOptions.css'

interface TransitOptionsProps {
  /** null for "leave now" */
  time: TripTime | null
  onTimeChange: (time: TripTime | null) => void
  /** Every mode in the timetables */
  modes: string[]
  /** The modes to keep to; any when empty */
  only: string[]
  onOnlyChange: (only: string[]) => void
}

type When = 'now' | TripTime['type']

/** The current local time as a datetime-local string, e.g. "2026-10-04T08:30". */
function localNow(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

const WHEN_LABELS: Record<When, string> = {
  now: 'Leave now',
  departAt: 'Depart at',
  arriveBy: 'Arrive by',
}

/** A chip that opens a small menu of choices under it. */
function OptionMenu({
  label,
  menuLabel,
  closeOnPick = false,
  alignEnd = false,
  children,
}: {
  label: string
  menuLabel: string
  /** Closes once a choice is made, for a menu of one choice */
  closeOnPick?: boolean
  /** Opens from the row's right edge rather than its left */
  alignEnd?: boolean
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  useClickOutside(ref, isOpen, () => setIsOpen(false))
  const items = () => [...(list.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])]

  useEffect(() => {
    if (!isOpen) return
    const all = items()
    ;(all.find((item) => item.getAttribute('aria-checked') === 'true') ?? all[0])?.focus()
  }, [isOpen])

  function close() {
    setIsOpen(false)
    button.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const all = items()
    const at = all.indexOf(document.activeElement as HTMLElement)
    const step = e.key === 'ArrowDown' ? 1 : -1
    e.preventDefault()
    all[(at + step + all.length) % all.length]?.focus()
  }

  return (
    <div ref={ref} className="option-menu">
      <button
        ref={button}
        type="button"
        className="chip option-menu__button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        {label}
      </button>
      {isOpen && (
        <div
          ref={list}
          className={alignEnd ? 'option-menu__list option-menu__list--end' : 'option-menu__list'}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={onKeyDown}
          onClick={(e) => closeOnPick && e.target !== e.currentTarget && close()}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** A choice in an OptionMenu, ticked when it's on. */
function OptionItem({
  role,
  isOn,
  onClick,
  children,
}: {
  role: 'menuitemradio' | 'menuitemcheckbox'
  isOn: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={isOn}
      className="option-menu__item"
      onClick={onClick}
    >
      <Icon name="check" />
      {children}
    </button>
  )
}

/** When to travel, and which kinds of transport to use. */
export function TransitOptions({
  time,
  onTimeChange,
  modes,
  only,
  onOnlyChange,
}: TransitOptionsProps) {
  const timeInput = useRef<HTMLInputElement>(null)
  const when: When = time?.type ?? 'now'

  function changeWhen(when: When) {
    if (when === 'now') onTimeChange(null)
    // Keep the chosen time when switching between "depart at" and "arrive by"
    else onTimeChange({ type: when, time: time?.time ?? localNow() })
  }

  const timeLabel = time?.type === 'arriveBy' ? 'Arrival time' : 'Departure time'

  function openTimePicker() {
    const input = timeInput.current
    if (!input) return
    try {
      input.showPicker()
    } catch {
      // Not allowed or not supported here: browsers that open pickers on focus still can
      input.focus()
      input.click()
    }
  }

  function toggleMode(mode: string) {
    onOnlyChange(modes.filter((m) => (m === mode) !== only.includes(m)))
  }

  return (
    <div className="transit-options">
      <OptionMenu label={WHEN_LABELS[when]} menuLabel="When" closeOnPick>
        {(Object.keys(WHEN_LABELS) as When[]).map((option) => (
          <OptionItem
            key={option}
            role="menuitemradio"
            isOn={option === when}
            onClick={() => changeWhen(option)}
          >
            {WHEN_LABELS[option]}
          </OptionItem>
        ))}
      </OptionMenu>
      {time && (
        // A chip like the others, over the browser's own picker (whose text can't match them:
        // phones need 16px in fields)
        <span className="transit-options__time">
          <button
            type="button"
            className="chip"
            aria-label={`${timeLabel}, ${formatDateTime(time.time)}`}
            onClick={openTimePicker}
          >
            {formatDateTime(time.time)}
          </button>
          <input
            ref={timeInput}
            type="datetime-local"
            tabIndex={-1}
            aria-label={timeLabel}
            value={time.time}
            onChange={(e) =>
              onTimeChange(e.target.value ? { ...time, time: e.target.value } : null)
            }
          />
        </span>
      )}

      {modes.length > 1 && (
        <OptionMenu
          label={only.length ? only.map(transitModeLabel).join(', ') : 'Any transport'}
          menuLabel="Use only these kinds of transport"
          alignEnd
        >
          {modes.map((mode) => (
            <OptionItem
              key={mode}
              role="menuitemcheckbox"
              isOn={only.includes(mode)}
              onClick={() => toggleMode(mode)}
            >
              {transitModeLabel(mode)}
            </OptionItem>
          ))}
        </OptionMenu>
      )}
    </div>
  )
}
