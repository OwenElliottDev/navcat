import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reverseGeocode } from '../api/search'
import type { Camera } from '../map/useCamera'
import type { LngLat, PhotonFeature } from '../types'
import { pointPlace } from '../utils/places'
import { selectProfile } from './selectors'
import { useAppStore } from '.'

vi.mock('../api/search', () => ({ reverseGeocode: vi.fn(), findNearbyPlace: vi.fn() }))
const geocode = vi.mocked(reverseGeocode)

const melbourne = { lng: 144.96, lat: -37.81 }
const geelong = { lng: 144.36, lat: -38.15 }
const home = { position: melbourne, label: 'Home' }
const work = { position: geelong, label: 'Work' }

// One pixel per 0.01 degrees, so distances on screen are easy to reason about
const camera = {
  flyTo: vi.fn(),
  fitBounds: vi.fn(),
  visibleArea: () => ({ bounds: [144, -38, 145, -37], near: melbourne }),
  project: (at: LngLat) => ({ x: at.lng * 100, y: -at.lat * 100 }),
} as unknown as Camera

/** A reverse geocode that answers when told to. */
function pendingGeocode() {
  let answer!: (found: PhotonFeature | null) => void
  geocode.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
  return (found: PhotonFeature | null) => {
    answer(found)
    return new Promise((resolve) => setTimeout(resolve)) // let the action finish
  }
}

const initial = useAppStore.getState()
const store = () => useAppStore.getState()

beforeEach(() => {
  useAppStore.setState(initial, true)
  useAppStore.setState({ camera })
  geocode.mockReset()
})

describe('directions', () => {
  it('setting one end opens directions and closes the place', () => {
    useAppStore.setState({ place: pointPlace(melbourne, 'Somewhere') })
    store().setWaypoint('to', work)
    expect(store()).toMatchObject({
      mode: 'directions',
      place: null,
      waypoints: { from: null, to: work },
    })
  })

  it('fills the other end only while it is empty', () => {
    store().setWaypoint('to', work, home)
    expect(store().waypoints).toEqual({ from: home, to: work })

    const elsewhere = { position: { lng: 145, lat: -37.9 }, label: 'Elsewhere' }
    store().setWaypoint('to', elsewhere, work)
    expect(store().waypoints).toEqual({ from: home, to: elsewhere })
  })

  it('closing directions clears both ends', () => {
    store().setWaypoint('from', home, work)
    store().closeDirections()
    expect(store()).toMatchObject({ mode: 'search', waypoints: { from: null, to: null } })
  })

  it('names a dropped pin once search finds what is there', async () => {
    const answer = pendingGeocode()
    const done = store().setWaypointAt('to', geelong)
    expect(store().waypoints.to?.label).toBe('-38.15000, 144.36000')
    await answer(pointPlace(geelong, 'Geelong Station'))
    await done
    expect(store().waypoints.to?.label).toBe('Geelong Station')
  })

  it("doesn't rename a pin that has moved since", async () => {
    const answer = pendingGeocode()
    store().setWaypointAt('to', geelong)
    store().setWaypoint('to', home)
    await answer(pointPlace(geelong, 'Geelong Station'))
    expect(store().waypoints.to).toEqual(home)
  })
})

describe('"What\'s here?"', () => {
  it('shows what search finds at the spot', async () => {
    const answer = pendingGeocode()
    store().showWhatsHere(melbourne)
    await answer(pointPlace(melbourne, 'Flinders Street Station'))
    expect(store().place?.properties.name).toBe('Flinders Street Station')
    expect(store().whatsHere).toBe(store().place)
  })

  it("a slow lookup doesn't replace a place opened meanwhile", async () => {
    const answer = pendingGeocode()
    store().showWhatsHere(melbourne)
    const opened = pointPlace(geelong, 'Opened meanwhile')
    store().showPlace(opened)
    await answer(pointPlace(melbourne, 'Too late'))
    expect(store().place).toBe(opened)
  })

  it('only the latest lookup is shown', async () => {
    const first = pendingGeocode()
    const second = pendingGeocode()
    store().showWhatsHere(melbourne)
    store().showWhatsHere(geelong)
    await second(pointPlace(geelong, 'Second'))
    await first(pointPlace(melbourne, 'First'))
    expect(store().place?.properties.name).toBe('Second')
  })
})

describe('map menu directions', () => {
  async function showWhatsHere(name: string) {
    const answer = pendingGeocode()
    store().showWhatsHere(melbourne)
    await answer(pointPlace(melbourne, name))
  }
  const screen = (at: LngLat) => camera.project(at)!

  it('opened on the "What\'s here?" dot, go to the place itself', async () => {
    await showWhatsHere('The spot')
    store().openMenu(screen(melbourne), melbourne)
    store().chooseMenuAction('to')
    expect(store().waypoints).toEqual({
      from: null,
      to: { position: melbourne, label: 'The spot' },
    })
  })

  it('opened elsewhere, start from the "What\'s here?" spot', async () => {
    await showWhatsHere('The spot')
    store().openMenu(screen(geelong), geelong)
    geocode.mockResolvedValueOnce(null)
    store().chooseMenuAction('to')
    expect(store().waypoints.from).toEqual({ position: melbourne, label: 'The spot' })
    expect(store().waypoints.to?.position).toBe(geelong)
  })
})

describe('browse', () => {
  it('searches the visible area, closing any place', () => {
    useAppStore.setState({ place: pointPlace(melbourne, 'Somewhere') })
    const category = { id: 'cafe', label: 'Cafes', words: [], osmValues: [] }
    useAppStore.setState({ moveCount: 3 })
    store().browseCategory(category)
    expect(store().place).toBeNull()
    expect(store().browse).toMatchObject({ category, near: melbourne, moveCount: 3 })
  })
})

describe('navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { isSecureContext: true })
    useAppStore.setState({ chosenProfile: 'bike' })
  })

  it('keeps the profile it started with, whatever is chosen after', () => {
    store().startNavigation()
    store().setChosenProfile('car')
    expect(selectProfile(store())).toBe('bike')
    store().endNavigation()
    expect(selectProfile(store())).toBe('car')
  })

  it('starts following you, and closes the menu', () => {
    useAppStore.setState({
      isFollowing: false,
      menu: { x: 0, y: 0, position: melbourne, whatsHere: null },
    })
    store().startNavigation()
    expect(store()).toMatchObject({ isFollowing: true, menu: null })
  })

  it("won't start without a secure connection", () => {
    vi.stubGlobal('window', { isSecureContext: false })
    store().startNavigation()
    expect(store().navigationProfile).toBeNull()
    expect(store().locationProblem).toMatch(/Navigation needs it/)
  })
})
