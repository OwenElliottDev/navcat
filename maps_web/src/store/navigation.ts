import type { StateCreator } from 'zustand'
import { requestCompass } from '../hooks/useCompass'
import { LOCATION_NEEDS_HTTPS } from '../utils/location'
import { loadMuted, say, storeMuted } from '../utils/voice'
import { selectProfile } from './selectors'
import type { Store } from '.'

/** Add ?simulate to the address to try navigation without going anywhere */
export const SIMULATE = new URLSearchParams(globalThis.location?.search).has('simulate')

/** Turn-by-turn: whether it's running, and how it's shown and spoken. */
export interface NavigationSlice {
  /** The travel mode being navigated, or null when not navigating */
  navigationProfile: string | null
  isNavigation3d: boolean
  /** Whether the map follows you; dragging it stops that until recentred */
  isFollowing: boolean
  isVoiceMuted: boolean

  startNavigation: () => void
  endNavigation: () => void
  toggleNavigation3d: () => void
  recentre: () => void
  stopFollowing: () => void
  speak: (text: string) => void
  /** Mutes, or unmutes and says so (speaking during the tap lets phones allow speech). */
  toggleVoiceMuted: () => void
}

export const createNavigationSlice: StateCreator<Store, [], [], NavigationSlice> = (set, get) => ({
  navigationProfile: null,
  isNavigation3d: true,
  isFollowing: true,
  isVoiceMuted: loadMuted(),

  startNavigation() {
    // Location (and so navigation) needs a secure connection: HTTPS, or localhost
    if (!window.isSecureContext && !SIMULATE) {
      set({ locationProblem: `${LOCATION_NEEDS_HTTPS} Navigation needs it to follow you.` })
      return
    }
    // Speaking during the tap lets mobile browsers allow speech for the rest of the trip
    const first = get().navRoute?.path.instructions[0]
    if (first) get().speak(first.text)
    requestCompass()
    set({
      locationProblem: null,
      menu: null,
      isFollowing: true,
      navigationProfile: selectProfile(get()),
    })
  },

  endNavigation: () => set({ navigationProfile: null }),
  toggleNavigation3d: () => set({ isNavigation3d: !get().isNavigation3d }),
  recentre: () => set({ isFollowing: true }),
  stopFollowing: () => set({ isFollowing: false }),

  speak(text) {
    if (!get().isVoiceMuted) say(text)
  },

  toggleVoiceMuted() {
    const muted = !get().isVoiceMuted
    set({ isVoiceMuted: muted })
    if (!muted) say('Voice guidance on')
    storeMuted(muted)
  },
})
