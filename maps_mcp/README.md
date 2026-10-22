# Nav Cat MCP server

An optional [MCP](https://modelcontextprotocol.io) server that lets AI agents reach what the
stack already does: search (Photon), routing (GraphHopper), public transport (OpenTripPlanner),
and places and browse (the backend). It's a thin layer over their APIs, adding only input checks,
its own limits, and answers trimmed for a model. Setup is in the main [README](../README.md).

## Tools

All read-only.

| Tool | What it does | Calls |
| --- | --- | --- |
| `capabilities` | The area covered, travel modes and route options, and the timetables' modes, dates and time zone | GraphHopper `/info`, OTP |
| `search_places` | Places by name, address or kind | Photon `/api`, backend `/api/places/search` |
| `reverse_geocode` | The place at a point | Photon `/reverse` |
| `get_place` | A place's details: all its tags, e.g. opening hours | backend `/api/places/{type}/{id}` |
| `list_categories` | The kinds of place to browse | backend `/api/browse/categories` |
| `find_nearby` | Places of a category within a distance | backend `/api/browse` |
| `plan_route` | A route through up to 10 waypoints, with legs and climbing | GraphHopper `/route` |
| `plan_transit` | Public transport journeys, leaving at or arriving by a time | OTP `planConnection` |
| `stop_departures` | The next services from stops found by name or near a point, each direction separately | OTP `stops`/`nearest`, `stoptimesWithoutPatterns` |
| `travel_times` | Times from each origin to each destination (up to 25 pairs, 9 by public transport) | GraphHopper `/route` or OTP, per pair |
| `reachable` | Places of a category within a travel time (up to 30 minutes) | GraphHopper `/isochrone`, backend `/api/browse` |

Places come with a link into Nav Cat, from the backend's `/api/links/encode_osm_shortlink`.
Times are the local time where a trip is (e.g. `2026-10-24T08:30`), with its time zone found
from its coordinates (`tzf-rs`, built in). OTP gives every time in the one zone its graph is in,
which for a stack covering several zones isn't the trip's.

## Resources and prompts

Resources `navcat://capabilities`, `navcat://categories` and `navcat://places/{type}/{id}` give
the same as their tools, for apps to add as context. Prompts `plan_day_trip`, `get_there` and
`whats_nearby` steer the model through the tools; their `mode` and `category` arguments
complete from the stack.

## Protection

- Stateless Streamable HTTP at `/mcp`, so nothing is kept per client
- `Host` checked against `MCP_ALLOWED_HOSTS`, and browser `Origin`s refused
- A bearer token (`MCP_TOKEN`), required to listen beyond this machine
- A rate limit per address (`MCP_RATE_LIMIT` a minute)
- A cap on requests at once to each service (GraphHopper 4, OTP 2, Photon and the backend 8),
  limits on each tool's size, and 64 KiB request bodies

## Development

Run it against a running stack's localhost ports:

```
MCP_LISTEN=127.0.0.1:7100 GRAPHHOPPER_URL=http://localhost:7989 OTP_URL=http://localhost:7088 \
  PHOTON_URL=http://localhost:7322 BACKEND_URL=http://localhost:7800 cargo run
```

```
cargo test
cargo clippy --all-targets -- -D warnings
cargo fmt
```

`tests/fixtures` holds the UI tests' mocked service answers (`maps_web/e2e/fixtures`) as JSON.
The avoid and steep-hill options copy the app's `CAR_AVOIDS` and `STEEP_HILLS`
(`maps_web/src/config.ts`): change them together.
