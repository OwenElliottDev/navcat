import './SearchThisArea.css'

/** Floating button shown after the map moves away from where results were found. */
export function SearchThisArea({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="search-this-area glass" onClick={onClick}>
      Search this area
    </button>
  )
}
