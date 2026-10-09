#!/bin/sh
# Runs the UI tests in the pinned Playwright container, the same browser and fonts as CI.
#   sh e2e/update-snapshots.sh            compare screenshots (npm run test:e2e:docker)
#   sh e2e/update-snapshots.sh --update   re-record them (npm run test:e2e:update)
# Extra arguments go to `playwright test`, e.g. a test file or --project=mobile.
set -eu
cd "$(dirname "$0")/.."

# Keep in step with @playwright/test in package.json
VERSION=$(node -p "require('@playwright/test/package.json').version")

ARGS=""
if [ "${1:-}" = "--update" ]; then
  shift
  ARGS="--update-snapshots=changed"
fi

# node_modules lives in a volume: the host's has native binaries for the host's OS
exec docker run --rm --init --ipc=host \
  -v "$PWD":/app -v maps-e2e-node-modules:/app/node_modules -w /app \
  -e CI=1 -e E2E_SCREENSHOTS=1 \
  "mcr.microsoft.com/playwright:v$VERSION-noble" \
  sh -c "npm ci --no-audit --no-fund && npx playwright test $ARGS $*"
