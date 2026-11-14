import { useEffect, useMemo, useRef } from 'react'
import { LayerPicker } from './components/LayerPicker'
import { MapLayers } from './components/MapLayers'
import { Navigation } from './components/Navigation'
import { Panel } from './components/Panel'
import { PitchToggle } from './components/PitchToggle'
import { Popups } from './components/Popups'
import { PHONE_QUERY, useMediaQuery } from './hooks/useMediaQuery'
import { useStoredLook } from './hooks/useStoredLook'
import { MapCanvas } from './map/MapCanvas'
import { MapControl } from './map/MapControl'
import { useCamera } from './map/useCamera'
import { useIsTilted } from './map/useIsTilted'
import { useMapLook } from './map/useMapLook'
import { useTerrainInfo } from './map/useTerrainInfo'
import { useAppStore } from './store'
import { selectIsNavigating } from './store/selectors'
import { TripData } from './store/TripData'
import './App.css'

export default function App() {
  // What covers the map, so the camera can keep things in view around it
  const panelRef = useRef<HTMLElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const overlays = useMemo(() => ({ panel: panelRef, top: topRef }), [])
  const camera = useCamera(overlays)
  useEffect(() => {
    useAppStore.setState({ camera })
  }, [camera])

  // Map type and overlays, remembered on this device
  const [look, setLook] = useStoredLook()
  const terrain = useTerrainInfo()
  const isTilted = useIsTilted()
  const isNavigating = useAppStore(selectIsNavigating)
  useMapLook(look, terrain, isTilted, isNavigating)

  // On phones the layers button sits under the search bar rather than with the map controls
  const isPhone = useMediaQuery(PHONE_QUERY)
  const layerPicker = (
    <LayerPicker look={look} onChange={setLook} hasTerrain={terrain !== null} asSheet={isPhone} />
  )

  return (
    <>
      <TripData />
      <MapCanvas />
      {!isPhone && <MapControl position="top-right">{layerPicker}</MapControl>}
      <MapControl position="top-right">
        <PitchToggle is3d={isTilted} />
      </MapControl>
      <MapLayers />
      <Navigation />
      <Panel panelRef={panelRef} topRef={topRef} layers={isPhone ? layerPicker : null} />
      <Popups />
    </>
  )
}
