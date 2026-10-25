/** iOS asks before sharing orientation */
interface OrientationPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

/**
 * Asks for the compass where the browser needs asking (iOS). Only works during a tap; a refusal
 * means no compass.
 */
export function requestCompass() {
  if (typeof DeviceOrientationEvent === 'undefined') return
  const permission = DeviceOrientationEvent as unknown as OrientationPermission
  permission.requestPermission?.().catch(() => {})
}
