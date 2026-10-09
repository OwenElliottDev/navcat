import { useEffect } from 'react'
import type { Photo } from '../types'
import { formatDate } from '../utils/format'
import { Dialog } from './Dialog'
import { Icon } from './icons'

interface PhotoViewerProps {
  photos: Photo[]
  index: number
  onIndexChange: (index: number) => void
  onDelete: (photo: Photo) => void
  onClose: () => void
}

/** One photo at full size, with arrows (and arrow keys) to step through the rest. */
export function PhotoViewer({ photos, index, onIndexChange, onDelete, onClose }: PhotoViewerProps) {
  const photo = photos[index]
  const step = (by: number) => onIndexChange((index + by + photos.length) % photos.length)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onIndexChange((index - 1 + photos.length) % photos.length)
      if (e.key === 'ArrowRight') onIndexChange((index + 1) % photos.length)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [index, photos.length, onIndexChange])

  if (!photo) return null
  return (
    <Dialog
      title={`Photo ${index + 1} of ${photos.length}`}
      onClose={onClose}
      className="photo-viewer"
    >
      <img
        className="photo-viewer__image"
        src={photo.url}
        alt={`Photo by ${photo.username}`}
        width={photo.width}
        height={photo.height}
      />
      <div className="photo-viewer__footer">
        <span className="note">
          {photo.username} · {formatDate(photo.createdAt)}
        </span>
        <div className="row">
          {photo.mine && (
            <button type="button" className="chip" onClick={() => onDelete(photo)}>
              Delete
            </button>
          )}
          {photos.length > 1 && (
            <>
              <button
                type="button"
                className="icon-button"
                aria-label="Previous photo"
                onClick={() => step(-1)}
              >
                <Icon name="back" />
              </button>
              <button
                type="button"
                className="icon-button photo-viewer__next"
                aria-label="Next photo"
                onClick={() => step(1)}
              >
                <Icon name="back" />
              </button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}
