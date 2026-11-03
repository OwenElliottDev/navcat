# Nav Cat backend

Accounts, places and shared links for Nav Cat, and the road data behind the speed-limit, cycleway and bike-route overlays: a FastAPI app in `app/`, with routers in `app/routes/` mounted under `/api`, on Postgres with PostGIS. nginx in the web container sends it every `/api` path that isn't search, routing or public transport, and it listens only on `127.0.0.1:7800`.

Migrations are numbered SQL files in `app/migrations/`, applied in name order at startup. The `pois` and `turn_lanes` tables are not among them: the POI import builds them (`docker_maps/db/import-pois.sh`). Settings are env vars in `app/config.py`.

`uv run pytest` runs the unit tests, `sh tests/api/run.sh` the HTTP tests against a throwaway PostGIS, and `uv run ruff check . && uv run ruff format .` and `uv run pyrefly check` are the lint and type check.
