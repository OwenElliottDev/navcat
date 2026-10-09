import type { BrowseState } from '../hooks/useBrowse'
import type { Category, Poi } from '../types'
import { formatDistance, humanize } from '../utils/format'
import { Icon } from './icons'
import { RouteStatus } from './RouteStatus'
import './BrowseResults.css'

interface BrowseResultsProps {
  category: Category
  state: BrowseState
  onSelect: (poi: Poi) => void
  onClose: () => void
}

/** The list of places found by browsing a category, nearest first. */
export function BrowseResults({ category, state, onSelect, onClose }: BrowseResultsProps) {
  return (
    <>
      <section className="card browse-header">
        <h2 className="card__title">{category.label}</h2>
        <button
          type="button"
          className="button button--icon"
          aria-label="Close results"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </section>

      {state.status !== 'ready' ? (
        <RouteStatus state={state} loadingText="Searching this area…" />
      ) : (
        <section className="card">
          {!state.data.results.length && (
            <p className="note">No {category.label.toLowerCase()} in this area. Try zooming out.</p>
          )}
          {state.data.truncated && (
            <p className="note">
              Showing the nearest {state.data.results.length}. Zoom in to see more.
            </p>
          )}

          <ul className="browse-list">
            {state.data.results.map((poi) => (
              <li key={`${poi.osmType}${poi.osmId}`}>
                <button type="button" className="browse-item" onClick={() => onSelect(poi)}>
                  <span className="browse-item__name">{poi.name ?? humanize(poi.category)}</span>
                  <span className="browse-item__distance">{formatDistance(poi.distance)}</span>
                  <span className="browse-item__detail">
                    {[humanize(poi.category), poi.tags['addr:street']].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
