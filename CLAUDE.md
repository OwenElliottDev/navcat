# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Nav Cat, a self-hosted Google-Maps-style app run with Docker Compose: map tiles (TileServer GL +
Planetiler), search (Photon), routing (GraphHopper), public transport (OpenTripPlanner), and a small
FastAPI backend for accounts, browse, and community place data (Postgres + PostGIS). Region defaults to
Australia (transit: VIC, south-east QLD, SA, WA); everything is configured in `.env` (see `.env.example`).

**Hard rule: the running stack makes no internet calls.** Data is downloaded only by the
`setup`-profile services, run by `./maps setup` and `./maps update`; nothing at runtime (frontend
or backend) may fetch from external hosts.

## Commands

Stack (from repo root; see README.md):

```
./maps setup                              # first time: download and build everything, then start
./maps update [map|places|routing|transit|search]  # refresh data on the running stack
./maps status                             # data ages, timetable expiry
docker compose up -d --build              # everything; web app at http://localhost:7000
docker compose up -d --build maps-web     # after frontend changes
docker compose up -d --build maps-backend # after backend changes
```

`docker-compose.yml` (prod) runs the published `owenelliottdev/navcat-*` images and mounts no
source; `docker-compose.dev.yml` overrides it to build them from the checkout, enabled with
`COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml` in `.env`. Scripts and config (POI import,
GraphHopper profiles, terrain builder) are baked into the images, so a new image needs adding to
both compose files and the matrix in `.github/workflows/docker.yml` (pushes on `v*` tags).

Frontend (`maps_web/`, React 19 + TypeScript + Vite + MapLibre):

```
npm run dev            # Vite dev server; proxies /api etc. to the containers' localhost ports
npm run build          # tsc -b && vite build (this is the type check)
npm run lint           # oxlint
npm run format         # prettier (no semicolons, single quotes, width 100)
```

Backend (`maps_backend/`, Python 3.13, managed with uv):

```
uv run pytest                                   # DB-free unit tests (API and smoke tests skip)
uv run pytest tests/test_logic.py::test_name    # one test
sh tests/api/run.sh                             # HTTP API tests: real app + throwaway PostGIS
MAPS_URL=http://localhost:7000 uv run pytest tests/smoke   # against a running stack
uv run ruff check . && uv run ruff format .     # line length 100
```

Use `pycurl` for HTTP in Python (not httpx/requests, and not FastAPI's TestClient); tests share
`tests/client.py`. API tests build fixture `pois`/`turn_lanes` tables in the import's shape
(`tests/api/conftest.py`) — update them with `pois.lua`.

Frontend tests (`maps_web/`):

```
npm test                 # Vitest, src/**/*.test.ts (pure logic; also checks nginx.conf ↔ vite.config.ts)
npm run test:e2e         # Playwright: real app, every service mocked by e2e/mockStack.ts
npm run test:e2e:docker  # same plus screenshot comparison, in CI's Playwright container
npm run test:e2e:update  # re-record screenshots after an intended UI change
```

The UI tests fail on any request without a fixture (`e2e/fixtures/`), so a new API call needs
one. Screenshots are only compared in the container (pinned to the `@playwright/test` version;
bump `.github/workflows/ci.yml`'s image with it).

## Architecture

**One origin, one `/api` prefix.** `maps_web/nginx.conf` (production) and `maps_web/vite.config.ts`
(dev) route paths to services and must be kept in sync:

- `/api/search`, `/api/reverse` → Photon; `/api/route`, `/api/info` → GraphHopper;
  `/api/transit` → OTP GraphQL (`/otp/gtfs/v1`)
- `/api/road-data/...` → backend (nginx-cached for 7 days)
- any other `/api/...` → `maps_backend`
- `/styles|data|fonts/` → TileServer (Host / X-Forwarded-Proto passed so its URLs point back through the proxy)
- `/terrain/...` → static tiles from `maps_data/terrain`, served by the web container's nginx

nginx resolves upstreams per request (proxying to variables), so the site still runs when a
service (e.g. OTP, paused during an update) is down. Only port 7000 is public; other services bind to 127.0.0.1 for
the Vite dev proxy. The frontend calls everything through the axios instance in `src/api/http.ts`.

**Backend (`maps_backend/app`).** FastAPI app in `main.py`; routers in `routes/` are mounted under
`/api`. Postgres via a psycopg async pool (`db.py`, dict rows; the `Db` dependency commits on
success, rolls back on error). Migrations are plain `app/migrations/NNN_*.sql` files applied in name
order at startup (`migrations.py`, tracked in `schema_migrations`) — add a new numbered file, never
edit an applied one. A middleware rejects POST/PUT/PATCH unless the body is JSON or an image (CSRF
protection alongside SameSite cookies). Settings come from env vars in `config.py`.
`road_data.py` fetches GraphHopper's vector tiles and slims them to speed limit / cycleway /
bike-route attributes for map overlays.

**Places & POIs.** The `pois` and `turn_lanes` tables are not created by migrations: the
`maps-poi-import` job (`docker_maps/db/import-pois.sh`) builds them, swapping them in atomically and
only re-importing when its inputs change (bump `IMPORT_VERSION` when the import's output changes).
It osmium-filters the OSM extract, runs `pois.lua` (osm2pgsql flex, in memory), then merges in
Overture Maps places (confidence > 0.7, downloaded by `maps-download` via `docker_maps/download/places.py`):
`places-prepare.sql`, `places-match.sql` (one psql per CPU) and `places-merge.sql`. Overture places
matching an OSM one (similar name nearby) only fill in its missing contact details; the rest become
type `O`, numbered by the persistent `overture_ids` table. Browse categories in `app/categories.py`
map to `pois.category`, which `pois.lua` fills from the amenity/shop/tourism/leisure/... tags and
`places-prepare.sql` maps Overture's taxonomy onto — change them together. Places are addressed as
`{place_type}/{id}` with OSM types (N/W/R), `U` for user-added places or `O` for Overture places;
user edits, reviews and photos live in migration-managed tables keyed the same way. Search covers
OSM via Photon and `U`/`O` places via `/api/places/search`. Photos are re-encoded with location
metadata stripped (`photos.py`) and stored under `PHOTOS_DIR`.

**Frontend (`maps_web/src`).** `App.tsx` holds top-level state and composes everything. `api/`
wraps each backend; `hooks/` holds data/behaviour hooks (routing, transit, browse, navigation,
voice); `map/` wraps MapLibre (a `MapProvider` context plus declarative components like
`RouteLine`, `PoiLayer`, `MapMarker`). Map looks (incl. the topo style with local terrain) are
built in `map/mapStyles.ts` by recolouring the TileServer style rather than loading other sources.
Travel modes are GraphHopper profiles (`src/config.ts`); "transit" is special-cased to OTP.
Cycling styles not configured in GraphHopper are hidden automatically. Turn-by-turn
(`hooks/useNavigation.ts`) follows a GraphHopper route, or a transit journey converted to the same
shape by `utils/transitNavigation.ts`. Lane guidance looks up OSM `turn:lanes` for the road into
each turn (`/api/lanes`, using GraphHopper's `osm_way_id` path detail). Car "avoid" options (`CAR_AVOIDS` in
`src/config.ts`) are sent as a GraphHopper custom model with `ch.disable`, so car has an LM profile
too; each option is hidden unless the encoded value it needs (`crossing`, `toll`, ...) is in `/info`.

**Data pipeline (`docker_maps/`).** `./maps` (repo root, POSIX sh) drives the setup-profile
services; updates build alongside the live data and swap it in, and `maps-updater` (opt-in,
`./maps schedule on`) runs them on cron schedules. GraphHopper profiles and custom models are in
`docker_maps/graphhopper/` — changing profiles or encoded values needs `./maps update routing`
(`maps-graphhopper-import` builds the graph, ~20 min, ~8.5 GB; serving needs ~2 GB). `./maps`
runs it itself when the image's config fingerprint (`graph-config.sha`, stored with the graph by
the import) differs. GraphHopper is built from source with `traffic-signals.patch`, so `crossing`
also marks roads at junction traffic lights. Public
transport streets are cut from the OSM extract around the GTFS stops, and feeds in other time
zones are rewritten into the graph's one, as OTP 2.10's own adjustment never runs
(`download/transit.sh`, `transit_prepare.py`). Terrain tiles are built by
`docker_maps/terrain/build_terrain.py` from GraphHopper's downloaded SRTM data. `maps_data/` holds
all data; `postgres/` and `photos/` are user-created and not rebuildable.
