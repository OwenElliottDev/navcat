import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Global styles first, so each component's own CSS can build on them
import './index.css'
import { AccountProvider } from './account/AccountProvider.tsx'
import App from './App.tsx'
import { FeaturesProvider } from './features/FeaturesProvider.tsx'
import { MapProvider } from './map/MapProvider.tsx'

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
