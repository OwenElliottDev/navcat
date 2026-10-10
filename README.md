# Nav Cat

Nav Cat is a self-hosted, Google Maps–style web app that runs entirely on your own hardware. Once
the data is downloaded, it works fully offline: no API keys and no calls to outside services.

- **Map** with vector tiles, plus a topographic style with hill shading
- **Search** for addresses and places, and browse places nearby by category
- **Directions** for driving, walking and several cycling styles, with elevation-aware routing
- **Public transport** journey planning from GTFS timetables
- **Turn-by-turn navigation** with voice prompts and lane guidance
- **Accounts** (optional) for saved places, reviews, photos and community edits to places

It's built from open-source components: [TileServer GL](https://github.com/maptiler/tileserver-gl)
and [Planetiler](https://github.com/onthegomap/planetiler) for the map,
[Photon](https://github.com/komoot/photon) for search, [GraphHopper](https://github.com/graphhopper/graphhopper)
for routing, [OpenTripPlanner](https://www.opentripplanner.org/) for public transport, and
Postgres + PostGIS for places and accounts. A React + MapLibre frontend and a FastAPI backend
tie them together.

The defaults cover Australia, with public transport for Victoria, south-east Queensland, Adelaide
and Perth (the states whose timetables need no API key). Any region with an OpenStreetMap extract
and GTFS timetables works.

## Requirements

- Docker with Docker Compose v2
- Memory for Docker: by default, building the routing graph and the public transport graph uses
  up to 8 GB each, and the running stack about 8 GB. 20 GB or more is comfortable; with less,
  updates pause public transport while the large builds run.
- Disk space for the data. For Australia, the routing graph alone is about 8.5 GB.

## Getting started

```
git clone https://github.com/OwenElliottDev/navcat.git
cd navcat
cp .env.example .env    # then set MAPS_POSTGRES_PASSWORD
./maps setup
```

`./maps setup` pulls the images, downloads the map, places and timetables, then builds the map
tiles, the routing graph and the public transport graph before starting everything. For
Australia this takes about an hour, mostly for the routing graph. It only does what's missing,
so it's safe to re-run.

When it finishes, open http://localhost:7000. The search index downloads on first start, so
search takes a few minutes to start working.

## Configuration

All settings live in `.env`; `.env.example` documents each one. The main ones:

| Setting | What it does |
| --- | --- |
| `OSM_URL`, `OSM_FILE` | The OpenStreetMap extract for your region (e.g. from [Geofabrik](https://download.geofabrik.de/)) |
| `TILES_AREA`, `TILES_FILE` | Planetiler's area name and the map tiles file |
| `PHOTON_REGION` | The search index region |
| `OVERTURE_COUNTRIES` | Countries whose Overture places are merged in (`OVERTURE_PLACES=false` turns this off) |
| `TRANSIT_GTFS_URLS` | GTFS timetables for public transport |
| `*_MEMORY` | Memory for each service and build |
| `ALLOW_SIGNUP` | Set to `false` once you've created your account |
| `COOKIE_SECURE` | Set to `true` when the site is served over HTTPS |
| `MAPS_TAG` | Which release of the images to run (default `latest`) |

The app is served on port 7000; every other service listens only on localhost. To expose the
app publicly, put a reverse proxy with HTTPS in front of it.

## Keeping data up to date

```
./maps status            # how old each piece of data is, and when the timetables expire
./maps update            # refresh everything
./maps update transit    # or just some of it: map, places, routing, transit, search
```

Each update builds the new data alongside the old and swaps it in, so each service is only down
for a restart. Keep the timetables current: OpenTripPlanner can only plan journeys on days they
cover, and `./maps status` warns before they run out.

To update on a schedule, run `./maps schedule on`. That updates the timetables weekly and
everything else monthly (set `UPDATE_*_SCHEDULE` and `TZ` in `.env`), logging to
`docker compose logs maps-updater`. The updater needs access to the Docker socket to restart
services, so it's off by default. `./maps schedule off` turns it off again.

## Backups

`maps_data/` (or `MAPS_DATA_DIR`) holds all the data. Almost everything there can be rebuilt by
`./maps setup`, except these two folders, which hold what users create:

- `postgres/`: accounts, saved places, reviews, and edits to places
- `photos/`: uploaded place photos (re-encoded, with location metadata removed)

## Development

`docker-compose.yml` runs the published images, which only change with a release. To run your
checkout instead, one command builds its images, rebuilds whatever data its changes need (e.g.
the routing graph, when the GraphHopper config has changed) and starts everything:

```
./maps dev
```

Run it again after any change. `./maps dev <command>` runs any other command the same way, e.g.
`./maps dev update routing`. On a Mac with Apple Silicon this is also much faster for the big
builds, as the published images are built for Intel and run emulated.

A plain `./maps setup` or `./maps update` goes back to the published images, and rebuilds the
routing graph if your checkout's routing config differs from theirs. To always use your checkout
(including for `docker compose` itself), put the dev override in `.env` instead:

```
COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml
```

Then `docker compose up -d --build maps-web` (or any service) rebuilds just that one.

- **Frontend** (`maps_web/`): `npm install && npm run dev` starts a live-reloading dev server
  that proxies `/api` to the running containers.
- **Backend** (`maps_backend/`): `uv run pytest` runs the unit tests.
- **Routing profiles** (`docker_maps/graphhopper/`): changing profiles or encoded values requires
  rebuilding the graph with `./maps update routing`. `./maps setup` and every `./maps update` do
  this themselves when the image's config differs from the one the graph was built with.
- **Places import**: `maps-poi-import` re-imports places only when its inputs change. Force a
  re-import with `docker compose run --rm -e FORCE=1 maps-poi-import`. The topo terrain
  (`maps-terrain-build`) works the same way.

### Tests

Run the ones covering what you changed before opening a pull request; CI runs them all.

| What | Where | Command | Needs |
| --- | --- | --- | --- |
| Frontend logic (navigation, opening hours, lanes, transit, map styles, nginx/Vite proxy in sync) | `maps_web/src/**/*.test.ts` | `npm test` | — |
| The app in a browser, every service mocked | `maps_web/e2e/` | `npm run test:e2e` | — |
| …plus screenshots, in CI's Linux browser | `maps_web/e2e/__screenshots__/` | `npm run test:e2e:docker` | Docker |
| Backend logic | `maps_backend/tests/test_*.py` | `uv run pytest` | — |
| Backend HTTP API on a real PostGIS | `maps_backend/tests/api/` | `sh tests/api/run.sh` | Docker |
| A running stack, through nginx | `maps_backend/tests/smoke/` | `MAPS_URL=http://localhost:7000 uv run pytest tests/smoke` | the stack |

- **UI tests** answer every request from `e2e/fixtures` (see `e2e/mockStack.ts`) and fail on
  any request without a fixture or to another host. A test can check what the app sent with
  `stack.requestsTo(...)`. When you add an API call, add its fixture.
- **Screenshots** of the panels (the map itself is hidden) are only compared in the pinned
  Playwright container, as fonts render differently on other systems. After an intended UI
  change, run `npm run test:e2e:update` and review the changed images in the diff.
  `npx playwright test --ui` is handy for debugging.
- **API tests** start the real backend against a fresh database, so migrations are tested from
  empty. `pois` and `turn_lanes` are fixture tables in the import's shape
  (`tests/api/conftest.py`), so keep them in step with `pois.lua`. To use your own Postgres,
  set `TEST_DATABASE_URL`.
- **Smoke tests** check every service answers with real data after an update or a change to
  the pipeline or `nginx.conf`. They default to Melbourne; for other regions set `SMOKE_FROM`,
  `SMOKE_TO` and `SMOKE_QUERY` (see the file).

### CI and releases

Every push and pull request runs lint, formatting checks, type checks, and the unit, UI
(with screenshots) and API tests, and builds every image. Pushing a `v*` tag builds every image and publishes it to Docker Hub as `owenelliottdev/navcat-*`,
tagged `latest`, with the version and with the commit:

```
git tag v1.0.0 && git push origin v1.0.0
```

## Data sources and attribution

- **[OpenStreetMap](https://www.openstreetmap.org/copyright)**: the map, routing, search and most
  places. © OpenStreetMap contributors, ODbL.
- **[Overture Maps](https://docs.overturemaps.org/attribution/) places**: businesses and places
  OpenStreetMap doesn't have yet, kept only above 0.7 confidence. Where OpenStreetMap already has
  the place, Overture only fills in missing contact details. Mostly CDLA-Permissive 2.0; places
  from Foursquare are Apache 2.0 (© 2024 Foursquare Labs, Inc.).
- **GTFS timetables**: public transport, under each publisher's licence.
- **SRTM elevation**: route elevation and the topo map's terrain.

## Licence

Nav Cat is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only).
You can run, change and share it freely; if you run a modified version that other people use
over a network, you must offer them its source code. The map data and the services it runs
(GraphHopper, OpenTripPlanner, Photon, TileServer GL, Planetiler) keep their own licences.

The `navcat-graphhopper` image contains GraphHopper (Apache-2.0), modified by
`docker_maps/graphhopper/traffic-signals.patch`. That patch is Apache-2.0 too, and the image ships
GraphHopper's `LICENSE.txt` and `NOTICE.md` with a note of the change
([`MODIFICATIONS.md`](docker_maps/graphhopper/MODIFICATIONS.md)).
