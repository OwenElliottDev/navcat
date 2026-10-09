#!/bin/sh
# Imports POIs for browsing and search from the same OSM extract as GraphHopper and the map
# tiles, merged with the Overture Maps places maps-download fetched for the same area, and
# turn lanes for navigation. Skips the import when neither file (nor this import) has changed
# since the last one, so it's safe to run on every `docker compose up`. Set FORCE=1 to import
# anyway.
set -eu

OSM="/osm/$OSM_FILE"
PLACES="/osm/${OSM_FILE%.osm.pbf}.places.csv.gz"

log() { echo "$(date +%H:%M:%S) $*"; }

# Memory for building indexes, for every psql session below
export PGOPTIONS="-c maintenance_work_mem=512MB -c client_min_messages=warning"

# A file's name, size and modified time
describe() { echo "$(basename "$1") $(stat -c '%s %Y' "$1")"; }
# Bump when the import changes what it makes, so existing installs re-import
IMPORT_VERSION=2
SOURCE="v$IMPORT_VERSION: $(describe "$OSM")"
if [ -f "$PLACES" ]; then
  SOURCE="$SOURCE, $(describe "$PLACES")"
fi

psql -q -v ON_ERROR_STOP=1 -c "
  CREATE TABLE IF NOT EXISTS poi_import (
    id          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    source      text NOT NULL,
    poi_count   bigint NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now()
  )"

LAST=$(psql -tA -c "SELECT source FROM poi_import")
if [ "$LAST" = "$SOURCE" ] && [ "${FORCE:-0}" != 1 ]; then
  echo "POIs are up to date with $SOURCE"
  exit 0
fi

log "Importing POIs from $OSM_FILE"
# Only what pois.lua could use: objects with one of its CATEGORY_KEYS and roads with turn
# lanes, plus the nodes and ways their shapes are made of. A tenth of the extract, so
# osm2pgsql can work in memory.
FILTERED=/tmp/pois.osm.pbf
osmium tags-filter --no-progress --overwrite -o "$FILTERED" "$OSM" \
  nwr/amenity,shop,tourism,leisure,healthcare,office,craft,historic \
  w/turn:lanes,turn:lanes:forward,turn:lanes:backward
osm2pgsql --create --output=flex --style=/import/pois.lua "$FILTERED"
rm "$FILTERED"

if [ -f "$PLACES" ]; then
  log "Merging in Overture places from $(basename "$PLACES")"
  # Columns in the order docker_maps/download/places.py writes them
  psql -q -v ON_ERROR_STOP=1 -c "
    DROP TABLE IF EXISTS overture_import;
    CREATE UNLOGGED TABLE overture_import (
      id text, name text, category text, basic_category text, top_category text,
      confidence real, source text, brand text, brand_wikidata text, phone text, website text,
      email text, facebook text, street text, locality text, postcode text, region text,
      lng float8, lat float8
    )"
  gzip -dc "$PLACES" | psql -q -v ON_ERROR_STOP=1 -c "COPY overture_import FROM STDIN (FORMAT csv, HEADER)"
  log "Preparing them"
  psql -q -v ON_ERROR_STOP=1 -f /import/places-prepare.sql

  # Matching is most of the work, so it's split between one connection per CPU
  WORKERS=$(nproc)
  log "Matching them against OSM's places ($WORKERS at once)"
  PIDS=""
  for worker in $(seq 0 $((WORKERS - 1))); do
    psql -q -v ON_ERROR_STOP=1 -v worker="$worker" -v workers="$WORKERS" \
      -f /import/places-match.sql &
    PIDS="$PIDS $!"
  done
  for pid in $PIDS; do
    wait "$pid" || { log "Matching failed"; exit 1; }
  done

  log "Adding them"
  psql -q -v ON_ERROR_STOP=1 -f /import/places-merge.sql
else
  log "No $(basename "$PLACES"), so only OSM's places. Run maps-download to add Overture's."
fi

log "Indexing"
# Swap the new tables in all at once, so browsing keeps working during a re-import
psql -q -v ON_ERROR_STOP=1 <<SQL
CREATE INDEX ON pois_import USING gist (geom);
CREATE INDEX ON pois_import (category);
CREATE INDEX ON pois_import (osm_type, osm_id);
ANALYZE pois_import;
CREATE INDEX ON turn_lanes_import (way_id);
ANALYZE turn_lanes_import;

BEGIN;
DROP TABLE IF EXISTS pois, turn_lanes;
ALTER TABLE pois_import RENAME TO pois;
ALTER TABLE turn_lanes_import RENAME TO turn_lanes;
INSERT INTO poi_import (source, poi_count)
  VALUES ('$SOURCE', (SELECT count(*) FROM pois))
  ON CONFLICT (id) DO UPDATE SET source = EXCLUDED.source, poi_count = EXCLUDED.poi_count, imported_at = now();
COMMIT;
SQL

log "$(psql -tA -c "SELECT 'Imported ' || poi_count || ' POIs' FROM poi_import")"
