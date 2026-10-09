import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { usePlaceSuggestions } from '../hooks/usePlaceSuggestions'
import type { PhotonFeature } from '../types'
import { describePlace } from '../utils/places'
import { Icon, type IconName } from './icons'
import './PlaceInput.css'

/** An extra choice in the dropdown, e.g. a recent search, saved place or category. */
export interface Shortcut {
  key: string
  label: string
  detail?: string | null
  icon: IconName
  onSelect: () => void
}

interface PlaceInputProps {
  label: string
  placeholder: string
  onPick: (place: PhotonFeature) => void
  /** Text to show when the parent changes it, e.g. after a pin is dragged. */
  value?: string
  /** Shows a coloured dot for route ends. */
  dot?: 'from' | 'to'
  autoFocus?: boolean
  /** Shown while the box is focused but empty, e.g. saved places and recent searches. */
  shortcuts?: Shortcut[]
  /** Shown above the search results for what's been typed, e.g. matching categories. */
  suggest?: (text: string) => Shortcut[]
  /** "pill" is the big rounded main search bar */
  variant?: 'field' | 'pill'
  /** Shown inside the box, before and after the text */
  leading?: ReactNode
  trailing?: ReactNode
  /**
   * Adds a clear button while there's text, which empties the box and calls this, e.g. to
   * close what was searched for. Escape with the dropdown closed does the same.
   */
  onClear?: () => void
}

interface Option {
  key: string
  label: string
  detail?: string | null
  icon: IconName
  select: () => void
}

/** A search box with a dropdown of places and shortcuts. */
export function PlaceInput({
  label,
  placeholder,
  onPick,
  value = '',
  dot,
  autoFocus,
  shortcuts = [],
  suggest,
  variant = 'field',
  leading,
  trailing,
  onClear,
}: PlaceInputProps) {
  const listId = useId()
  const [text, setText] = useState(value)
  const [isOpen, setIsOpen] = useState(false)
  const [active, setActive] = useState(-1)

  // Follow the parent's value when it changes
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setText(value)
  }

  const typed = text.trim()
  const suggestions = usePlaceSuggestions(isOpen ? text : '')

  const placeOptions: Option[] = (suggestions?.results ?? []).map((place, i) => {
    const { name, kind, address } = describePlace(place)
    return {
      key: `place-${i}`,
      label: name,
      detail: [kind, address].filter(Boolean).join(', '),
      icon: 'pin',
      select: () => onPick(place),
    }
  })
  const toOption = (s: Shortcut): Option => ({ ...s, select: s.onSelect })

  let options: Option[] = []
  if (isOpen) {
    options = typed
      ? [...(suggest?.(typed) ?? []).map(toOption), ...placeOptions]
      : shortcuts.map(toOption)
  }
  // Nothing found (or search down) is only worth saying once a search has answered
  const status = isOpen && typed && suggestions && !options.length ? suggestions : null

  function choose(option: Option) {
    setText(option.label)
    setIsOpen(false)
    setActive(-1)
    option.select()
  }

  function clear() {
    setText('')
    setIsOpen(false)
    setActive(-1)
    onClear?.()
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (!options.length && onClear && text) clear()
      setIsOpen(false)
      return
    }
    if (!options.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((active + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((active - 1 + options.length) % options.length)
    } else if (e.key === 'Enter' && (typed || active >= 0)) {
      // With text typed, Enter takes the top match; with an empty box, only an arrowed-to shortcut
      e.preventDefault()
      choose(options[Math.max(active, 0)])
    }
  }

  return (
    <div className="place-input">
      <div
        className={['field', `field--${variant}`, dot && `field--dot field--${dot}`]
          .filter(Boolean)
          .join(' ')}
      >
        {leading}
        <input
          type="search"
          aria-label={label}
          placeholder={placeholder}
          autoComplete="off"
          autoFocus={autoFocus}
          role="combobox"
          aria-controls={listId}
          aria-expanded={options.length > 0}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setIsOpen(true)
            setActive(-1)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => setIsOpen(false)}
        />
        {onClear && text && (
          <button
            type="button"
            className="icon-button field__clear"
            aria-label="Clear"
            title="Clear"
            // Keeps focus (and the keyboard) where it was
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
          >
            <Icon name="close" />
          </button>
        )}
        {trailing}
      </div>

      {(options.length > 0 || status) && (
        <ul id={listId} className="suggestions" role="listbox">
          {status?.failed && (
            <li className="error">
              Search isn't responding. Check that the Photon container is running.
            </li>
          )}
          {status && !status.failed && (
            <li className="note">No matches. Try a street, suburb or business name.</li>
          )}
          {options.map((option, i) => (
            <li
              key={option.key}
              id={`${listId}-${i}`}
              className="suggestion"
              role="option"
              aria-selected={i === active}
              // mousedown + preventDefault keeps focus in the input, so blur doesn't close the list first
              onMouseDown={(e) => {
                e.preventDefault()
                choose(option)
              }}
            >
              <Icon name={option.icon} className="icon suggestion__icon" />
              <span className="suggestion__text">
                <span className="suggestion__name">{option.label}</span>
                {option.detail && <span className="suggestion__detail">{option.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
