/** Opened from the iOS home screen (which, without a manifest, doesn't match `display-mode: standalone`) */
export const isIosApp = (navigator as { standalone?: boolean }).standalone === true

/**
 * The app's height. iOS home-screen apps draw under the status bar but give `innerHeight` without
 * it, so there the app is sized to the whole screen (`.ios-app` in index.css), which `outerHeight` is.
 */
export function viewportHeight(): number {
  return isIosApp ? window.outerHeight : window.innerHeight
}
