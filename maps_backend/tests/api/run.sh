#!/bin/sh
# Runs the API tests (tests/api) against a throwaway Postgres + PostGIS in Docker, built from
# the stack's own database image. Extra arguments go to pytest, e.g. -k photos or -x.
# With TEST_DATABASE_URL already set, uses that server instead and skips Docker.
set -eu
cd "$(dirname "$0")/../.."

if [ -n "${TEST_DATABASE_URL:-}" ]; then
  exec uv run pytest tests/api "$@"
fi

IMAGE=maps-db-test
CONTAINER="maps-api-test-$$"
PORT=${TEST_DB_PORT:-55432}

docker build -q -t "$IMAGE" ../docker_maps/db >/dev/null
docker run -d --rm --name "$CONTAINER" -p "127.0.0.1:$PORT:5432" \
  -e POSTGRES_PASSWORD=test "$IMAGE" -c fsync=off -c full_page_writes=off >/dev/null
trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true' EXIT INT TERM

# Over TCP, so the temporary server Postgres runs while initialising doesn't count as ready
tries=0
until docker exec "$CONTAINER" pg_isready -q -h 127.0.0.1 -U postgres; do
  tries=$((tries + 1))
  if [ "$tries" -gt 60 ]; then
    docker logs "$CONTAINER"
    echo "Postgres didn't start" >&2
    exit 1
  fi
  sleep 1
done

TEST_DATABASE_URL="postgresql://postgres:test@127.0.0.1:$PORT/postgres" \
  uv run pytest tests/api "$@"
