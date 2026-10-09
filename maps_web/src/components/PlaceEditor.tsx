import { useState, type FormEvent } from 'react'
import { apiErrorMessage } from '../api/http'
import { addPlace, editPlace } from '../api/places'
import { useCategories } from '../hooks/useCategories'
import type { LngLat, PlaceRef, PoiDetails } from '../types'
import { humanize } from '../utils/format'
import { parseOpeningHours } from '../utils/openingHours'
import { Dialog } from './Dialog'

interface Field {
  tag: string
  label: string
  type?: 'tel' | 'url'
  placeholder?: string
}

// Matches what the backend lets people edit
const CONTACT_FIELDS: Field[] = [
  { tag: 'phone', label: 'Phone', type: 'tel' },
  { tag: 'website', label: 'Website', type: 'url', placeholder: 'https://' },
]
const ADDRESS_FIELDS: Field[] = [
  { tag: 'addr:housenumber', label: 'Number' },
  { tag: 'addr:street', label: 'Street' },
  { tag: 'addr:suburb', label: 'Suburb' },
  { tag: 'addr:postcode', label: 'Postcode' },
]
const ALL_TAGS = [...CONTACT_FIELDS, ...ADDRESS_FIELDS]
  .map((f) => f.tag)
  .concat('opening_hours', 'description')

export interface PlaceDraft {
  name: string
  category: string
  tags: Record<string, string>
}

interface PlaceEditorProps {
  /** The place being corrected, or null when adding a new one at `position` */
  place: PlaceRef | null
  position?: LngLat
  initial: PlaceDraft
  onSaved: (details: PoiDetails) => void
  onClose: () => void
}

/** Corrects a place's details, or adds a place the map doesn't have. */
export function PlaceEditor({ place, position, initial, onSaved, onClose }: PlaceEditorProps) {
  const categories = useCategories()
  const [draft, setDraft] = useState<PlaceDraft>(() => ({
    ...initial,
    tags: Object.fromEntries(ALL_TAGS.map((tag) => [tag, initial.tags[tag] ?? ''])),
  }))
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isNew = place === null
  // OSM places keep their category; people's own places can change it
  const canChangeCategory = isNew || place.type === 'U'
  const setTag = (tag: string, value: string) =>
    setDraft((d) => ({ ...d, tags: { ...d.tags, [tag]: value } }))

  async function save(e: FormEvent) {
    e.preventDefault()
    setIsSaving(true)
    setError(null)
    try {
      onSaved(isNew ? await addPlace(newPlace()) : await editPlace(place, changes()))
    } catch (err) {
      setError(apiErrorMessage(err, 'Couldn’t save. Check the details and try again.'))
      setIsSaving(false)
    }
  }

  function newPlace() {
    const tags = Object.fromEntries(Object.entries(draft.tags).filter(([, value]) => value.trim()))
    return {
      name: draft.name.trim(),
      category: draft.category,
      lng: position!.lng,
      lat: position!.lat,
      tags,
    }
  }

  /** Only what changed; a cleared field is sent as "" to remove it */
  function changes() {
    const tags = Object.fromEntries(
      Object.entries(draft.tags).filter(
        ([tag, value]) => value.trim() !== (initial.tags[tag] ?? ''),
      ),
    )
    return {
      ...(draft.name.trim() !== initial.name && { name: draft.name.trim() }),
      ...(canChangeCategory && draft.category !== initial.category && { category: draft.category }),
      tags,
    }
  }

  const hours = draft.tags.opening_hours.trim()
  const hoursUnderstood = !hours || parseOpeningHours(hours) !== null
  const knownCategory = categories.some((c) => c.osmValues[0] === draft.category)

  return (
    <Dialog title={isNew ? 'Add a place' : 'Edit details'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        {!isNew && <p className="note">Changes are shared with everyone using this map.</p>}

        <label className="form__field">
          Name
          <input
            required
            maxLength={200}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            autoFocus={isNew}
          />
        </label>

        {canChangeCategory && (
          <label className="form__field">
            Kind of place
            <select
              required
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            >
              <option value="" disabled>
                Choose…
              </option>
              {/* Keep an existing category that isn't one of the browse categories */}
              {draft.category && !knownCategory && (
                <option value={draft.category}>{humanize(draft.category)}</option>
              )}
              {categories.map((category) => (
                <option key={category.id} value={category.osmValues[0]}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {CONTACT_FIELDS.map((field) => (
          <label key={field.tag} className="form__field">
            {field.label}
            <input
              type={field.type}
              placeholder={field.placeholder}
              value={draft.tags[field.tag]}
              onChange={(e) => setTag(field.tag, e.target.value)}
            />
          </label>
        ))}

        <label className="form__field">
          Opening hours
          <input
            placeholder="Mo-Fr 07:00-16:00; Sa 08:00-12:00"
            value={draft.tags.opening_hours}
            onChange={(e) => setTag('opening_hours', e.target.value)}
          />
          <span className="form__hint">
            {hoursUnderstood
              ? 'Days (Mo Tu We Th Fr Sa Su) then times, separated by ;'
              : 'This will show as plain text. Try a format like Mo-Fr 07:00-16:00; Sa 08:00-12:00'}
          </span>
        </label>

        <div className="form__row">
          {ADDRESS_FIELDS.map((field) => (
            <label key={field.tag} className="form__field">
              {field.label}
              <input
                value={draft.tags[field.tag]}
                onChange={(e) => setTag(field.tag, e.target.value)}
              />
            </label>
          ))}
        </div>

        <label className="form__field">
          Description
          <textarea
            rows={2}
            maxLength={300}
            value={draft.tags.description}
            onChange={(e) => setTag('description', e.target.value)}
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="form__actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={isSaving}>
            {isNew ? 'Add place' : 'Save'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
