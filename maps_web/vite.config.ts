/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Ports published by docker-compose.yml
const PHOTON = 'http://localhost:7322'
const GRAPHHOPPER = 'http://localhost:7989'
const TILESERVER = 'http://localhost:7080'
const OTP = 'http://localhost:7088'
const BACKEND = 'http://localhost:7800'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // MapLibre loads its worker as an ES module
  worker: { format: 'es' },
  build: {
    rolldownOptions: {
      output: {
        // Libraries get their own chunks so a deploy that only changes our code
        // doesn't make returning visitors re-download them
        codeSplitting: {
          groups: [
            { name: 'maplibre', test: /node_modules[\\/]maplibre-gl/, priority: 2 },
            { name: 'vendor', test: /node_modules/, priority: 1 },
          ],
        },
      },
    },
    // MapLibre alone is ~1 MB minified (~280 kB gzipped) and is needed on first load anyway
    chunkSizeWarningLimit: 1100,
  },
  // Unit tests (npm test) sit next to the code they test; e2e/ is Playwright's (npm run test:e2e)
  test: { include: ['src/**/*.test.{ts,tsx}'] },
  server: {
    // Mirrors nginx.conf so the app can talk to the containers in development
    proxy: {
      '/api/search': { target: PHOTON, rewrite: (path) => path.replace(/^\/api\/search/, '/api') },
      '/api/reverse': {
        target: PHOTON,
        rewrite: (path) => path.replace(/^\/api\/reverse/, '/reverse'),
      },
      '/api/route': {
        target: GRAPHHOPPER,
        rewrite: (path) => path.replace(/^\/api\/route/, '/route'),
      },
      '/api/info': {
        target: GRAPHHOPPER,
        rewrite: (path) => path.replace(/^\/api\/info/, '/info'),
      },
      '/api/transit': {
        target: OTP,
        rewrite: (path) => path.replace(/^\/api\/transit/, '/otp/gtfs/v1'),
      },
      // Everything else under /api (accounts, browse); listed after the exact matches above
      '/api': { target: BACKEND },
      // Terrain tiles are built locally and served by the web container's nginx
      '^/terrain/': { target: 'http://localhost:7000' },
      // Tileserver builds tile URLs from the Host header, so keep it pointing at this dev server
      '^/(styles|data|fonts)/': { target: TILESERVER },
    },
  },
})
