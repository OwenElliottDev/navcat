import type { PhotonFeature } from '../types'
import { AccountButton } from './AccountButton'
import { Icon } from './icons'
import { PlaceInput, type Shortcut } from './PlaceInput'

interface SearchBarProps {
  /** What's being shown, e.g. the place or category, which the clear button closes */
  value: string
  onClear: () => void
  onPick: (place: PhotonFeature) => void
  onDirections: () => void
  shortcuts: Shortcut[]
  suggest: (text: string) => Shortcut[]
}

/** The main search pill: search, directions and your account in one bar. */
export function SearchBar({
  value,
  onClear,
  onPick,
  onDirections,
  shortcuts,
  suggest,
}: SearchBarProps) {
  return (
    <PlaceInput
      variant="pill"
      label="Search places"
      placeholder="Search Maps"
      value={value}
      onClear={onClear}
      onPick={onPick}
      shortcuts={shortcuts}
      suggest={suggest}
      leading={<Icon name="search" />}
      trailing={
        <>
          <button
            type="button"
            className="icon-button"
            aria-label="Directions"
            title="Directions"
            onClick={onDirections}
          >
            <Icon name="directions" />
          </button>
          <AccountButton />
        </>
      }
    />
  )
}
