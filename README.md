# Nav Cat

[![CI](https://github.com/OwenElliottDev/navcat/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/OwenElliottDev/navcat/actions/workflows/ci.yml)
[![Images](https://github.com/OwenElliottDev/navcat/actions/workflows/docker.yml/badge.svg)](https://github.com/OwenElliottDev/navcat/actions/workflows/docker.yml)
[![Version](https://img.shields.io/github/v/tag/OwenElliottDev/navcat?sort=semver&label=version)](https://github.com/OwenElliottDev/navcat/tags)
[![Docker pulls](https://img.shields.io/docker/pulls/owenelliottdev/navcat-web)](https://hub.docker.com/r/owenelliottdev/navcat-web)
[![Licence: AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-blue)](LICENSE)

Nav Cat is a self-hosted map browsing and routing web app for desktop and mobile. It features advanced routing for walking, cycling, public transport, and driving. Walking and cycling have advanced features such as optional hill avoidance, bike type specific routing, GPX exporting, and elevation graphs. Public transport uses publicly released timetables and allows you to set target arrival and departure times.

Nav Cat downloads all its required data at setup time and then runs without any external APIs, it can we run offline after setup is completed. Any searches, reviews, photos, or saved places all remain on your server.

- **Map** with vector tiles, plus a topographic style with hill shading and 3D view
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
  up to 8 GB each, and the running stack about 8 GB. 16 GB or more is comfortable; with less,
  updates pause public transport while the large builds run.
- Disk space for the data. For Australia, the data is > 10GB.

## Getting started

```
git clone https://github.com/OwenElliottDev/navcat.git
cd navcat
cp .env.example .env    # then set MAPS_POSTGRES_PASSWORD
./maps setup
```

`./maps setup` pulls the released images, downloads the map, places and timetables, then builds the map
tiles, the routing graph and the public transport graph before starting everything. The setup time can vary significantly with map area selection and hardware specs, it can range from minutes to hours. It only does whats missing so you can re-run it anytime.

When it finishes, open http://localhost:7000. The search index downloads on first start, so it address search may not be instantly operational.

## Configuration

All settings live in `.env`; `.env.example` documents each one. The main ones:

| Setting | What it does |
| --- | --- |
| `OSM_URL`, `OSM_FILE` | The OpenStreetMap extract for your region (e.g. from [Geofabrik](https://download.geofabrik.de/)); list several URLs, separated by spaces, to merge them |
| `TILES_AREA`, `TILES_FILE` | Planetiler's area name and the map tiles file |
| `PHOTON_REGION` | The search index region |
| `OVERTURE_COUNTRIES` | Countries whose Overture places are merged in (`OVERTURE_PLACES=false` turns this off) |
| `TRANSIT_GTFS_URLS` | GTFS timetables for public transport |
| `*_MEMORY` | Memory for each service and build |
| `ALLOW_SIGNUP` | Set to `false` once you've created your account |
| `ALLOW_PLACE_EDITS`, `ALLOW_REVIEWS`, `ALLOW_PHOTOS` | Set to `false` to stop people adding and editing places, writing reviews, or adding photos |
| `SAFETY_CHECK_PHOTOS` | Turns away photos showing nudity or gore (on by default) |
| `COOKIE_SECURE` | Set to `true` when the site is served over HTTPS |
| `MAPS_TAG` | Which release of the images to run (default `latest`; `edge` follows main) |

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

`docker-compose.yml` runs the published images, which only change with a release. To run a dev build from your checkout instead, use the `dev` arg:

```
./maps dev
```

Run it again after any change. `./maps dev <command>` runs any other command the same way, e.g.
`./maps dev update routing`.

The places import (`maps-poi-import`) only re-runs when its inputs change. To force a
re-import, run `docker compose run --rm -e FORCE=1 maps-poi-import`. The topo terrain build
(`maps-terrain-build`) works the same way.

## Testing

Run the tests relevant to your change before opening a pull request. CI runs the full suite on every pull request. Frontend commands are run from `maps_web/` and backend commands from `maps_backend/`.

### Frontend unit tests

Located in `maps_web/src/**/*.test.ts`. These cover navigation, opening hours, lane guidance, transit, and map styles. They also verify that the nginx and Vite proxy configurations stay in sync.

    npm test

### End-to-end tests

Located in `maps_web/e2e/`. These run the app in a browser with all backend services mocked.

    npm run test:e2e

Responses are served from fixtures in `e2e/fixtures` (see `e2e/mockStack.ts`). A test fails if the app makes a request that has no matching fixture or that targets an external host. Tests can assert on outgoing requests using `stack.requestsTo(...)`. When adding a new API call, add a corresponding fixture.

For interactive debugging, use `npx playwright test --ui`.

### Screenshot tests

Baselines are stored in `maps_web/e2e/__screenshots__/`. Running these requires Docker.

    npm run test:e2e:docker

Screenshot comparisons cover the UI panels only; the map canvas is hidden. Because font rendering differs between systems, screenshots are compared only inside the pinned Playwright Docker container used by CI. After an intentional UI change, regenerate the baselines and review the updated images in the diff:

    npm run test:e2e:update

### Backend unit tests

Located in `maps_backend/tests/test_*.py`.

    uv run pytest

### Backend API tests

Located in `maps_backend/tests/api/`. Running these requires Docker.

    sh tests/api/run.sh

The API tests start the real backend against a fresh PostGIS database, so migrations are exercised from an empty schema. The `pois` and `turn_lanes` tables are fixtures that mirror the structure produced by the import (defined in `tests/api/conftest.py`). Keep them consistent with `pois.lua` when changing the import. To run against an existing Postgres instance instead, set `TEST_DATABASE_URL`.

### Smoke tests

Located in `maps_backend/tests/smoke/`. Running these requires a running stack.

    MAPS_URL=http://localhost:7000 uv run pytest tests/smoke

The smoke tests send requests through nginx and verify that every service returns real data. Run them after a data update, or after changes to the import pipeline or `nginx.conf`. They target Melbourne by default; to test another region, set `SMOKE_FROM`, `SMOKE_TO`, and `SMOKE_QUERY` (see `tests/smoke/` for details).

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

Nav Cat is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). The map data and the services it runs
(GraphHopper, OpenTripPlanner, Photon, TileServer GL, Planetiler) keep their own licences.

The `navcat-graphhopper` image contains GraphHopper (Apache-2.0), modified by
`docker_maps/graphhopper/traffic-signals.patch`. That patch is Apache-2.0 too, and the image ships
GraphHopper's `LICENSE.txt` and `NOTICE.md` with a note of the change
([`MODIFICATIONS.md`](docker_maps/graphhopper/MODIFICATIONS.md)).
