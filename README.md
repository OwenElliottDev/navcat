# Nav Cat

[![CI](https://github.com/OwenElliottDev/navcat/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/OwenElliottDev/navcat/actions/workflows/ci.yml)
[![Images](https://github.com/OwenElliottDev/navcat/actions/workflows/docker.yml/badge.svg)](https://github.com/OwenElliottDev/navcat/actions/workflows/docker.yml)
[![Version](https://img.shields.io/github/v/tag/OwenElliottDev/navcat?sort=semver&label=version)](https://github.com/OwenElliottDev/navcat/tags)
[![Docker pulls](https://img.shields.io/docker/pulls/owenelliottdev/navcat-web)](https://hub.docker.com/r/owenelliottdev/navcat-web)
[![Licence: AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-blue)](LICENSE)

Nav Cat is a self-hosted map browsing and routing web app for desktop and mobile. It has
vector maps with a topographic style (hill shading and a 3D view), search for addresses and
places, browsing nearby places by category, and directions for driving, walking, several cycling
styles and public transport. Walking and cycling routes can avoid steep hills, suit your type of
bike, show an elevation graph and export to GPX. Public transport journeys are planned from GTFS
timetables, leaving or arriving at a time you choose. Turn-by-turn navigation has voice prompts
and lane guidance.

Optional accounts add saved places, reviews, photos and community edits to places, and an
optional MCP server lets AI agents search places and plan trips with real travel times.

Nav Cat downloads all the data it needs at setup and then runs without any external APIs, so it
works offline. Searches, reviews, photos and saved places all stay on your server.

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
- Disk space for the data: more than 10 GB for Australia.

## Getting started

```
git clone https://github.com/OwenElliottDev/navcat.git
cd navcat
cp .env.example .env    # then set MAPS_POSTGRES_PASSWORD
./maps setup
```

`./maps setup` pulls the released images, downloads the map, places and timetables, then builds the map
tiles, the routing graph and the public transport graph before starting everything. It takes
anywhere from minutes to hours, depending on the region and your hardware. It only does what's
missing, so you can re-run it any time.

When it finishes, open http://localhost:7000. Search downloads its index on first start, so
address search may take a few minutes to start working.

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

## AI agents (MCP)

An optional [MCP](https://modelcontextprotocol.io) server lets AI agents use Nav Cat to find
places and plan trips with realistic travel times: routes, public transport journeys, travel
times between several places, opening hours, and what's within a few minutes' reach. It only
reads from the stack, and links its answers to places in Nav Cat.

Turn it on with `COMPOSE_PROFILES=mcp` in `.env`, then `docker compose up -d maps-mcp`. It
listens on port 7100 of this machine only. To connect Claude Code:

```
claude mcp add --transport http navcat http://localhost:7100/mcp
```

To reach it from other machines, set `MCP_BIND=0.0.0.0` (or an address), `MCP_TOKEN` (clients
send it as `Authorization: Bearer <token>`) and `MCP_ALLOWED_HOSTS` to the names they use for
this machine. Set `MCP_PUBLIC_URL` to Nav Cat's address so links work for them. Behind a reverse
proxy, put the proxy's address in `MCP_TRUSTED_PROXIES` so the rate limit is per client rather than
shared, and its public host name in `MCP_ALLOWED_HOSTS`. See
[maps_mcp/README.md](maps_mcp/README.md) for its tools.

## Development

`docker-compose.yml` runs the published images, which only change with a release. To build them
from your checkout instead, run:

```
./maps dev
```

Run it again after any change. `./maps dev <command>` runs any other command the same way, e.g.
`./maps dev update routing`.

The places import (`maps-poi-import`) only re-runs when its inputs change. To force a
re-import, run `docker compose run --rm -e FORCE=1 maps-poi-import`. The topo terrain build
(`maps-terrain-build`) works the same way.

## Testing

Frontend commands run from `maps_web/`, backend ones from `maps_backend/` and `cargo test` from
`maps_mcp/`.

```
npm test                  # frontend unit tests
npm run test:e2e          # the app in a browser, with every service mocked
npm run test:e2e:docker   # the same plus screenshot comparison (needs Docker)
npm run test:e2e:update   # re-record screenshots after an intended UI change
uv run pytest             # backend unit tests
sh tests/api/run.sh       # backend API tests (needs Docker)
cargo test                # MCP server
MAPS_URL=http://localhost:7000 uv run pytest tests/smoke   # against a running stack
```

The browser tests answer every request from `e2e/fixtures` (see `e2e/mockStack.ts`) and fail on
any request with no fixture or to an external host, so a new API call needs a fixture. Tests can
check outgoing requests with `stack.requestsTo(...)`, and `npx playwright test --ui` runs them
interactively. Screenshots cover the UI panels only, with the map canvas hidden, and are only
compared inside the pinned Playwright container, since font rendering differs between systems;
after re-recording them, review the changed images in the diff.

The API tests start the real backend against a fresh PostGIS database, so migrations run from an
empty schema. The `pois` and `turn_lanes` tables are fixtures in the shape the import makes
(`tests/api/conftest.py`); keep them in step with `pois.lua`. Set `TEST_DATABASE_URL` to use an
existing Postgres instead.

The smoke tests go through nginx and check that every service returns real data. Run them after
a data update, or after changing the import or `nginx.conf`. They target Melbourne; set
`SMOKE_FROM`, `SMOKE_TO` and `SMOKE_QUERY` for another region (see `tests/smoke/`).

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
