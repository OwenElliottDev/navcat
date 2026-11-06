import { useRef, useState, type FormEvent } from 'react'
import { useAccount } from '../account/AccountContext'
import { apiErrorCode, apiErrorMessage } from '../api/http'
import { deletePhoto, deleteReview, uploadPhoto, writeReview } from '../api/places'
import { useFeatures } from '../features/FeaturesContext'
import type { Photo, PlaceRef, Review } from '../types'
import { formatDate } from '../utils/format'
import { shrinkPhoto } from '../utils/images'
import { Dialog } from './Dialog'
import { PhotoViewer } from './PhotoViewer'
import { StarInput, Stars } from './Stars'
import './PlaceCommunity.css'

interface PlaceCommunityProps {
  place: PlaceRef
  photos: Photo[]
  reviews: Review[]
  rating: number | null
  /** Called after anything changes, so the card can fetch the latest */
  onChanged: () => void
}

/** Photos and reviews from people using this map. */
export function PlaceCommunity({ place, photos, reviews, rating, onChanged }: PlaceCommunityProps) {
  return (
    <>
      <Photos place={place} photos={photos} onChanged={onChanged} />
      <Reviews place={place} reviews={reviews} rating={rating} onChanged={onChanged} />
    </>
  )
}

function Photos({
  place,
  photos,
  onChanged,
}: {
  place: PlaceRef
  photos: Photo[]
  onChanged: () => void
}) {
  const { user, requestSignIn } = useAccount()
  const { allowPhotos } = useFeatures()
  const inputRef = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isUnsafe, setIsUnsafe] = useState(false)

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setIsUploading(true)
    setError(null)
    try {
      for (const file of files) await uploadPhoto(place, await shrinkPhoto(file))
    } catch (err) {
      if (apiErrorCode(err) === 'unsafe_photo') setIsUnsafe(true)
      else setError(apiErrorMessage(err, 'Couldn’t add that photo.'))
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
      onChanged()
    }
  }

  async function remove(photo: Photo) {
    if (!confirm('Delete this photo?')) return
    await deletePhoto(photo.id)
    setViewing(null)
    onChanged()
  }

  if (!allowPhotos && photos.length === 0) return null

  return (
    <section className="community-section" aria-label="Photos">
      <h3 className="community-section__title">Photos</h3>
      <div className="photo-strip">
        {allowPhotos && (
          <button
            type="button"
            className="photo-strip__add"
            disabled={isUploading}
            onClick={() => (user ? inputRef.current?.click() : requestSignIn())}
          >
            {isUploading ? 'Adding…' : '+ Add photo'}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => upload(e.target.files)}
        />
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            className="photo-strip__photo"
            onClick={() => setViewing(i)}
          >
            <img src={photo.thumbUrl} alt={`Photo by ${photo.username}`} loading="lazy" />
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}

      {isUnsafe && (
        <Dialog title="Photo not accepted" onClose={() => setIsUnsafe(false)}>
          <div className="form">
            <p>
              This photo looks like it shows explicit or graphic content, so it can't be added. Try
              a different photo.
            </p>
            <div className="form__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => setIsUnsafe(false)}
              >
                OK
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {viewing !== null && (
        <PhotoViewer
          photos={photos}
          index={viewing}
          onIndexChange={setViewing}
          onDelete={remove}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  )
}

interface ReviewsProps {
  place: PlaceRef
  reviews: Review[]
  rating: number | null
  onChanged: () => void
}

function Reviews({ place, reviews, rating, onChanged }: ReviewsProps) {
  const { user, requestSignIn } = useAccount()
  const { allowReviews } = useFeatures()
  const [isWriting, setIsWriting] = useState(false)
  const mine = reviews.find((review) => review.mine)

  async function removeMine() {
    if (!confirm('Delete your review?')) return
    await deleteReview(place)
    setIsWriting(false)
    onChanged()
  }

  if (!allowReviews && reviews.length === 0) return null

  return (
    <section className="community-section" aria-label="Reviews">
      <div className="community-section__header">
        <h3 className="community-section__title">Reviews</h3>
        {rating !== null && (
          <span className="reviews__average">
            {rating.toFixed(1)} <Stars value={rating} />
          </span>
        )}
      </div>

      {isWriting ? (
        <ReviewForm
          place={place}
          mine={mine}
          onDone={() => {
            setIsWriting(false)
            onChanged()
          }}
          onDelete={removeMine}
          onCancel={() => setIsWriting(false)}
        />
      ) : (
        allowReviews && (
          <button
            type="button"
            className="chip"
            onClick={() => (user ? setIsWriting(true) : requestSignIn())}
          >
            {mine ? 'Edit your review' : 'Write a review'}
          </button>
        )
      )}
      {/* Posting is off, but people can still take down their own review */}
      {!allowReviews && mine && (
        <button type="button" className="chip" onClick={removeMine}>
          Delete your review
        </button>
      )}

      {reviews.length === 0 && !isWriting && <p className="note reviews__empty">No reviews yet.</p>}
      <ul className="reviews">
        {reviews.map((review) => (
          <li key={review.id} className="review">
            <div className="review__meta">
              <strong>{review.mine ? 'You' : review.username}</strong>
              <Stars value={review.rating} />
              <time className="note" dateTime={review.updatedAt}>
                {formatDate(review.updatedAt)}
              </time>
            </div>
            {review.body && <p className="review__body">{review.body}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

interface ReviewFormProps {
  place: PlaceRef
  mine: Review | undefined
  onDone: () => void
  onDelete: () => void
  onCancel: () => void
}

function ReviewForm({ place, mine, onDone, onDelete, onCancel }: ReviewFormProps) {
  const [rating, setRating] = useState(mine?.rating ?? 0)
  const [body, setBody] = useState(mine?.body ?? '')
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!rating) {
      setError('Pick a rating first.')
      return
    }
    try {
      await writeReview(place, rating, body)
      onDone()
    } catch (err) {
      setError(apiErrorMessage(err, 'Couldn’t save your review.'))
    }
  }

  return (
    <form className="review-form" onSubmit={save}>
      <StarInput value={rating} onChange={setRating} />
      <textarea
        aria-label="Your review"
        placeholder="What was it like? (optional)"
        rows={3}
        maxLength={2000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      <div className="review-form__actions">
        {mine && (
          <button type="button" className="link-button" onClick={onDelete}>
            Delete
          </button>
        )}
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button--primary">
          Post
        </button>
      </div>
    </form>
  )
}
