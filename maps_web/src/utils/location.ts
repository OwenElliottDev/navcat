import type { LngLat } from '../types'

export const LOCATION_NEEDS_HTTPS = 'Your location is only shared over a secure (HTTPS) connection.'

/** The device's position, once. Rejects with a message fit to show the user. */
export function currentPosition(): Promise<LngLat> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) return reject(new Error(LOCATION_NEEDS_HTTPS))
    if (!('geolocation' in navigator))
      return reject(new Error('This browser can’t share your location.'))
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lng: position.coords.longitude, lat: position.coords.latitude }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location is turned off for this site. Allow it in your browser settings.'
              : 'Couldn’t find your location. Try again outside or near a window.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    )
  })
}

/** Whether location is already allowed, so using it won't pop up a permission prompt. */
export async function isLocationAllowed(): Promise<boolean> {
  if (!window.isSecureContext || !navigator.permissions) return false
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted'
  } catch {
    return false
  }
}
