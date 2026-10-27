# Nav Cat web app

The map, search, directions and turn-by-turn navigation for Nav Cat: React, TypeScript and
MapLibre, built with Vite. In production the `maps-web` container serves it with nginx, which
also proxies `/api` and the map tiles to the other services (`nginx.conf`).

With the stack running, `npm run dev` starts a Vite dev server that proxies the same paths to
the containers' localhost ports (`vite.config.ts`, kept in step with `nginx.conf`).

`npm run build` type checks and builds, `npm test` runs the unit tests, and `npm run test:e2e`
runs the UI tests in a browser with every service mocked from `e2e/fixtures`. `npm run lint` and
`npm run format` run oxlint and prettier.
