import { useShallow } from 'zustand/react/shallow'
import { useAccount } from '../account/AccountContext'
import { matchCategories } from '../hooks/useCategories'
import { useAppStore } from '../store'
import {
  selectBrowsing,
  selectIsOnFootOrBike,
  selectIsTransit,
  selectProfile,
} from '../store/selectors'
import type { Category, End, PhotonFeature } from '../types'
import { describePlace, snapshotToWaypoint, toSnapshot, toWaypoint } from '../utils/places'
import { categoryShortcut, recentShortcut, savedPlaceShortcut } from '../utils/shortcuts'
import { AdditionalOptions } from './AdditionalOptions'
import { CarOptions } from './CarOptions'
import { CategoryChips } from './CategoryChips'
import { DirectionsForm } from './DirectionsForm'
import { SearchBar } from './SearchBar'
import { TransitOptions } from './TransitOptions'

/** The search bar and category chips, or the directions form and its options. */
export function PanelTop() {
  const account = useAccount()
  const {
    mode,
    place,
    browse,
    categories,
    waypoints,
    routing,
    locationProblem,
    avoid,
    avoidSteepHills,
    tripTime,
    transitModes,
    excludedModes,
  } = useAppStore(
    useShallow((s) => ({
      mode: s.mode,
      place: s.place,
      browse: selectBrowsing(s),
      categories: s.categories,
      waypoints: s.waypoints,
      routing: s.routing,
      locationProblem: s.locationProblem,
      avoid: s.avoid,
      avoidSteepHills: s.avoidSteepHills,
      tripTime: s.tripTime,
      transitModes: s.transitModes,
      excludedModes: s.excludedModes,
    })),
  )
  const actions = useAppStore.getState()
  const profile = useAppStore(selectProfile)
  const isTransit = useAppStore(selectIsTransit)
  const isOnFootOrBike = useAppStore(selectIsOnFootOrBike)
  const isBrowsing = browse !== null

  function browseCategory(category: Category) {
    account.addRecent({ query: category.label, category: category.id })
    actions.browseCategory(category)
  }

  /** A place picked from the search box. */
  function pickPlace(feature: PhotonFeature) {
    account.addRecent({ query: describePlace(feature).name, place: toSnapshot(feature) })
    useAppStore.setState({ browse: null })
    actions.showPlace(feature)
  }

  function pickWaypoint(end: End, feature: PhotonFeature) {
    account.addRecent({ query: describePlace(feature).name, place: toSnapshot(feature) })
    actions.setWaypoint(end, toWaypoint(feature))
  }

  // The search bar shows what's open, and clearing it closes that
  const searchValue = place ? describePlace(place).name : browse ? browse.category.label : ''

  /* ---------- dropdown shortcuts ---------- */

  const searchShortcuts = [
    ...account.savedPlaces.map((saved) =>
      savedPlaceShortcut(saved, () => actions.showSnapshot(saved)),
    ),
    ...account.recents.slice(0, 8).map((recent) =>
      recentShortcut(recent, () => {
        const category = categories.find((c) => c.id === recent.category)
        if (category) {
          browseCategory(category)
        } else if (recent.place) {
          account.addRecent(recent) // moves it back to the top
          actions.showSnapshot(recent.place)
        }
      }),
    ),
  ]

  const suggestCategories = (text: string) =>
    matchCategories(categories, text).map((category) =>
      categoryShortcut(category, () => browseCategory(category)),
    )

  const waypointShortcuts = (end: End) => [
    {
      key: 'here',
      label: 'Your location',
      icon: 'locate' as const,
      onSelect: () => actions.setWaypointToHere(end),
    },
    ...account.savedPlaces.map((saved) =>
      savedPlaceShortcut(saved, () =>
        actions.setWaypoint(end, { ...snapshotToWaypoint(saved), label: saved.label }),
      ),
    ),
    ...account.recents
      .filter((recent) => recent.place)
      .slice(0, 6)
      .map((recent) =>
        recentShortcut(recent, () => actions.setWaypoint(end, snapshotToWaypoint(recent.place!))),
      ),
  ]

  return (
    <>
      {mode === 'search' ? (
        <>
          <SearchBar
            value={searchValue}
            onClear={actions.closeBrowse}
            onPick={pickPlace}
            onDirections={actions.openDirections}
            shortcuts={searchShortcuts}
            suggest={suggestCategories}
          />
          <CategoryChips
            categories={categories}
            activeId={isBrowsing ? browse.category.id : null}
            onSelect={browseCategory}
          />
        </>
      ) : (
        <DirectionsForm
          from={waypoints.from}
          to={waypoints.to}
          profiles={routing.profiles}
          profile={profile}
          onPick={pickWaypoint}
          shortcutsFor={waypointShortcuts}
          onProfileChange={actions.setChosenProfile}
          onSwap={actions.swapEnds}
          onClose={actions.closeDirections}
        />
      )}
      {mode === 'directions' && locationProblem && (
        <p className="error panel__problem" role="alert">
          {locationProblem}
        </p>
      )}
      {mode === 'directions' && profile === 'car' && (
        <CarOptions available={routing.carAvoids} avoid={avoid} onChange={actions.setAvoid} />
      )}
      {mode === 'directions' && isOnFootOrBike && routing.steepHills && (
        <AdditionalOptions
          avoidSteepHills={avoidSteepHills}
          onAvoidSteepHillsChange={actions.setAvoidSteepHills}
        />
      )}
      {mode === 'directions' && isTransit && (
        <TransitOptions
          time={tripTime}
          onTimeChange={actions.setTripTime}
          modes={transitModes}
          excluded={excludedModes}
          onExcludedChange={actions.setExcludedModes}
        />
      )}
    </>
  )
}
