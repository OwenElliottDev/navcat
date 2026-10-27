# Contributing to Nav Cat

## Before you start

- Search the existing issues and pull requests first, then use the bug report or feature request template, and fill in the pull request template when you open a PR.
- For a new feature, open an issue to discuss it before writing code.
- For a bug fix, describe how to reproduce the bug and add a test that fails without the fix. If it can't reasonably be tested (map styling, a data pipeline script), say how you checked it instead.
- Keep each pull request to one change. Use your best judgement on whether a refactor belongs with a feature or in its own PR.

## AI usage

AI usage is welcome, but you are responsible for every line you submit, however it was written. Before opening a PR, make sure you can explain and defend the change without help. Disclosure is not required but it is encouraged, with a `Co-Authored-By` trailer on the commits or a note in the PR.

An agent can help with the PR description, but it has to read as yours: a few sentences on what changed and why, that you've checked are true. No generated summaries of every file, headings for a three-line change, or claims you couldn't back up in review. [A template is available](./.github/pull_request_template.md).

## Core tenets

- Nav Cat treats active and public transport as first class citizens, fully featured walking and bike routing is core functionality, as is public transport routing. Any PR which creates an asymmetry between the routing options where it would be unreasonable to do so (e.g. only supporting re-routing for one mode or being like Apple Maps and only allowing you to add stops when routing for cars) will be be considered incomplete.
- The running stack makes no internet calls. Data is downloaded only by `./maps setup` and `./maps update`. Nothing in the frontend or backend may fetch from an external host at runtime, including map styles, fonts, tiles and voices.
- A feature that needs a service can fail when that service is down, with a clear error. Don't add fallbacks or copies of another service's logic to keep it working. Features that don't need the service must keep working without it.
- Logic lives in one place. If both the frontend and the MCP server need it, it goes in the backend.
- `maps_web/nginx.conf` (production) and `maps_web/vite.config.ts` (development) route the same paths to the same services. Change them together; `npm test` checks they agree.
- Database migrations are numbered files in `maps_backend/app/migrations/`. Add a new one; never edit one that has been released.
- The `pois` and `turn_lanes` tables are built by the POI import, not migrations. If you change `docker_maps/db/pois.lua`, update the API test fixtures in `maps_backend/tests/api/conftest.py` and bump `IMPORT_VERSION` in `import-pois.sh`.
- Every API is public, and some are there for other apps rather than the UI. Don't remove an endpoint because the frontend doesn't use it.
- Backend errors are `{"detail", "code"}`: a short, neutral `detail` and a `code` the frontend can react to. Wording for users lives in the frontend.
- A new image needs adding to `docker-compose.yml`, `docker-compose.dev.yml` and the matrix in `.github/workflows/docker.yml`.

## Checking your change

CI runs the following for each part you change. Run the same locally before opening a PR.

- **Frontend** (`maps_web/`): `npm run lint`, `npm run format:check`, `npm run build` (the type check), `npm test` and `npm run test:e2e`.
- **Backend** (`maps_backend/`): `uv run ruff check .`, `uv run ruff format --check .`, `uv run pyrefly check`, `uv run pytest` and `sh tests/api/run.sh` (needs Docker).
- **MCP server** (`maps_mcp/`): `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test`.

The UI tests answer every request from `maps_web/e2e/fixtures` (see `e2e/mockStack.ts`) and fail on any request without one or to an external host, so a new API call needs a fixture. Tests can check what the app sent with `stack.requestsTo(...)`, and `npx playwright test --ui` runs them interactively.

Screenshots cover the UI panels with the map canvas hidden, and are only compared in CI's Playwright container, since font rendering differs between systems. `npm run test:e2e:docker` runs that container locally. If you change the UI on purpose, re-record them with `npm run test:e2e:update` and check the new images in the diff.

The API tests start the real backend against a fresh PostGIS database, so migrations run from an empty schema. `tests/api/run.sh` starts one in Docker; set `TEST_DATABASE_URL` to a Postgres server with PostGIS to use that instead (the tests create and drop a `maps_api_test` database on it).

If you change the import, a data pipeline script or `nginx.conf`, also run the smoke tests against your own stack, from `maps_backend/`:

```
MAPS_URL=http://localhost:7000 uv run pytest tests/smoke
```

They go through nginx and check every service returns real data, around Melbourne by default. For another region set `SMOKE_FROM` and `SMOKE_TO` (`lng,lat`, a short walk apart, near public transport if you have it) and `SMOKE_QUERY` (a name search should find).

## Code style

- Fix formatting with the formatters (`npm run format`, `uv run ruff format .`, `cargo fmt`), not by hand. TypeScript and Python lines are 100 characters wide.
- Write comments only for what the code can't say: why something is done, or a quirk of a service it works around. No banner or divider comments.
- Python HTTP uses `pycurl`, including in tests (`tests/client.py`), not httpx, requests or FastAPI's `TestClient`.
- The frontend calls every service through the axios instance in `src/api/http.ts`.
- Markdown should not be line-wrapped by hand, editors and renderers handle wrapping.