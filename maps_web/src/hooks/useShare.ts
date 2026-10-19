import type { LngLat } from '../types'
import { shareLink } from '../utils/links'
import { useCopy } from './useCopy'

/**
 * Shares a link to a spot through the device's share sheet, or copies it where there isn't
 * one; a tick, a tooltip and a message for screen readers say when it's been copied.
 */
export function useShare() {
  const { copy, ...feedback } = useCopy('link', { icon: 'share', title: 'Share a link' })

  async function share(at: LngLat, zoom?: number) {
    const url = shareLink(at, zoom)
    if (navigator.share) {
      try {
        await navigator.share({ url })
        return
      } catch (err) {
        // Closing the sheet is a choice, not a failure; anything else, copy it instead
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    await copy(url)
  }

  return { share, ...feedback }
}
