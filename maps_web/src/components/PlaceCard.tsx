import { useState, type ReactNode } from 'react'
import { useAccount } from '../account/AccountContext'
import { useCommunity } from '../hooks/useCommunity'
import { usePlaceDetails } from '../hooks/usePlaceDetails'
import type { End, PhotonFeature, SavedPlace, SavedPlaceKind } from '../types'
import { humanize } from '../utils/format'
import { describePlace, isSamePlace, placeRef, toSnapshot, withDetails } from '../utils/places'
import { ActionButton } from './ActionButton'
import { CopyButton } from './CopyButton'
import { Icon } from './icons'
import { OpeningHours } from './OpeningHours'
import { PlaceCommunity } from './PlaceCommunity'
import { PlaceEditor } from './PlaceEditor'
import { Stars } from './Stars'
import './PlaceCard.css'

interface PlaceCardProps {
  place: PhotonFeature
  onDirections: (end: End) => void
  /** Shows a "Back to results" link, e.g. when opened from a browse list. */
  onBack?: () => void
}

export function PlaceCard({ place, onDirections, onBack }: PlaceCardProps) {
  const { user, savedPlaces, savePlace, removePlace, requestSignIn } = useAccount()
  const ref = placeRef(place)

  // Bumped after an edit, review or photo so the card fetches the latest
  const [detailsVersion, setDetailsVersion] = useState(0)
  const [communityVersion, setCommunityVersion] = useState(0)
  const details = usePlaceDetails(ref, detailsVersion)
  const community = useCommunity(ref, communityVersion)
  const [isEditing, setIsEditing] = useState(false)

  // Search results carry few details; show the full set, with people's corrections
  const shown = withDetails(place, details)
  const { name, kind, address } = describePlace(shown)
  const snapshot = toSnapshot(shown)

  const extra = shown.properties.extra ?? {}
  const hours = extra.opening_hours
  const phone = extra.phone ?? extra['contact:phone']
  const website = extra.website ?? extra['contact:website']
  const safeWebsite = website && /^https?:\/\//.test(website) ? website : undefined
  // OSM can list several numbers ("03 9123 4567;0412 345 678"); dial the first
  const phoneHref = phone && `tel:${phone.split(';')[0].replace(/[^\d+]/g, '')}`

  const savedAs = (kind: SavedPlaceKind) =>
    savedPlaces.find((saved) => saved.kind === kind && isSamePlace(saved, snapshot))

  /** Saves or un-saves this place as Home, Work or a favourite. */
  function toggleSaved(kind: SavedPlaceKind, label: string) {
    if (!user) {
      requestSignIn()
      return
    }
    const existing = savedAs(kind)
    if (existing) removePlace(existing.id)
    else savePlace({ ...snapshot, kind, label })
  }

  return (
    <section className="card place-card">
      {onBack && (
        <button type="button" className="link-button back-link" onClick={onBack}>
          <Icon name="back" /> Results
        </button>
      )}

      <h2 className="card__title">{name}</h2>
      {kind && <p className="card__kind">{kind}</p>}
      {community.status === 'ready' && community.data.rating !== null && (
        <p className="place-rating">
          <strong>{community.data.rating.toFixed(1)}</strong>{' '}
          <Stars value={community.data.rating} />{' '}
          <span className="note">
            ({community.data.reviewCount} review{community.data.reviewCount === 1 ? '' : 's'})
          </span>
        </p>
      )}

      <div className="place-actions">
        <ActionButton
          icon="directions"
          label="Directions"
          primary
          onClick={() => onDirections('to')}
        />
        <ActionButton icon="start" label="Start here" onClick={() => onDirections('from')} />
        {phoneHref && <ActionButton icon="phone" label="Call" href={phoneHref} />}
        {safeWebsite && <ActionButton icon="globe" label="Website" href={safeWebsite} />}
        <ActionButton
          icon="saved"
          label={savedAs('favourite') ? 'Saved' : 'Save'}
          pressed={Boolean(savedAs('favourite'))}
          onClick={() => toggleSaved('favourite', snapshot.name)}
        />
      </div>

      {(address || hours || phone || safeWebsite) && (
        <dl className="place-details">
          {address && (
            <Detail label="Address" copy={address}>
              {address}
            </Detail>
          )}
          {hours && (
            <Detail label="Hours">
              <OpeningHours value={hours} />
            </Detail>
          )}
          {phone && (
            <Detail label="Phone" copy={phone}>
              <a href={phoneHref}>{phone}</a>
            </Detail>
          )}
          {safeWebsite && (
            <Detail label="Website" copy={safeWebsite}>
              <a href={safeWebsite} target="_blank" rel="noopener noreferrer">
                {new URL(safeWebsite).hostname}
              </a>
            </Detail>
          )}
        </dl>
      )}

      {extra.description && <p className="place-description">{extra.description}</p>}
      {ref?.type === 'O' && <OvertureSource source={extra['overture:source']} />}

      <HomeWork savedAs={savedAs} onToggle={toggleSaved} />

      {/* Details live in our database only for imported places and places people added */}
      {ref && details && (
        <button
          type="button"
          className="link-button edit-link"
          onClick={() => (user ? setIsEditing(true) : requestSignIn())}
        >
          Missing or wrong details? Edit
        </button>
      )}

      {ref && community.status === 'ready' && (
        <PlaceCommunity
          place={ref}
          photos={community.data.photos}
          reviews={community.data.reviews}
          rating={community.data.rating}
          onChanged={() => setCommunityVersion((v) => v + 1)}
        />
      )}

      {isEditing && ref && details && (
        <PlaceEditor
          place={ref}
          initial={{ name: details.name ?? name, category: details.category, tags: details.tags }}
          onSaved={() => {
            setIsEditing(false)
            setDetailsVersion((v) => v + 1)
          }}
          onClose={() => setIsEditing(false)}
        />
      )}
    </section>
  )
}

/** Where a place OSM doesn't have came from, e.g. "Listed by Meta via Overture Maps". */
function OvertureSource({ source }: { source?: string }) {
  const by = source ? `${humanize(source)} via ` : ''
  return (
    <p className="note place-source">
      Listed by {by}
      <a href="https://overturemaps.org" target="_blank" rel="noopener noreferrer">
        Overture Maps
      </a>
    </p>
  )
}

interface DetailProps {
  label: string
  children: ReactNode
  /** Adds a copy button for this text */
  copy?: string
}

function Detail({ label, children, copy }: DetailProps) {
  return (
    <div className="place-details__row">
      <div className="place-details__text">
        <dt>{label}</dt>
        <dd>{children}</dd>
      </div>
      {copy && <CopyButton text={copy} label={label.toLowerCase()} />}
    </div>
  )
}

interface HomeWorkProps {
  savedAs: (kind: SavedPlaceKind) => SavedPlace | undefined
  onToggle: (kind: SavedPlaceKind, label: string) => void
}

/** Quieter options for making this place Home or Work. */
function HomeWork({ savedAs, onToggle }: HomeWorkProps) {
  return (
    <div className="home-work" role="group" aria-label="Set as Home or Work">
      {(['home', 'work'] as const).map((kind) => {
        const label = kind === 'home' ? 'Home' : 'Work'
        const isSet = Boolean(savedAs(kind))
        return (
          <button
            key={kind}
            type="button"
            className="chip"
            aria-pressed={isSet}
            onClick={() => onToggle(kind, label)}
          >
            <Icon name={kind} />
            {isSet ? label : `Set as ${label}`}
          </button>
        )
      })}
    </div>
  )
}
