import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Global styles first, so each component's own CSS can build on them
import './index.css'
import { AccountProvider } from './account/AccountProvider.tsx'
import App from './App.tsx'
import { FeaturesProvider } from './features/FeaturesProvider.tsx'
import { linkedView } from './linkedView'
import { MapProvider } from './map/MapProvider.tsx'
import { useAppStore } from './store'

// Opened from a link to a spot: say what's there, leaving the map where the link put it
if (linkedView?.marker) useAppStore.getState().showWhatsHere(linkedView.marker, false)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FeaturesProvider>
      <MapProvider>
        <AccountProvider>
          <App />
        </AccountProvider>
      </MapProvider>
    </FeaturesProvider>
  </StrictMode>,
)
