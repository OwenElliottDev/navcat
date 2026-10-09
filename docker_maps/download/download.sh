#!/bin/sh
# Downloads the OSM extract that GraphHopper, Planetiler and the POI import read, then
# Overture Maps places for the same area (merged into browse and search by the POI import).
#
#   download.sh            both
#   download.sh osm        just the OSM extract
#   download.sh places     just the places, for the extract already downloaded
#
# Files are downloaded under a temporary name and swapped in when complete, so running
# services keep using the old ones until then.
set -eu
. /fetch.sh
cd /osm

OSM="$OSM_FILE"
PLACES="${OSM_FILE%.osm.pbf}.places.csv.gz"
WHAT="${1:-all}"

if [ "$WHAT" = all ] || [ "$WHAT" = osm ]; then
  echo "Downloading $OSM_URL"
  fetch "$OSM.tmp" "$OSM_URL"
  mv "$OSM.tmp" "$OSM"
fi

if [ "$WHAT" = all ] || [ "$WHAT" = places ]; then
  if [ "${OVERTURE_PLACES:-true}" != true ]; then
    echo "OVERTURE_PLACES isn't true: skipping places"
    rm -f "$PLACES"
    exit 0
  fi
  # The extract's bounding box from its header, e.g. "(112.5,-44.1,159.2,-9.1)"
  BBOX=$(osmium fileinfo --no-progress -g header.boxes "$OSM" | head -n 1 | tr -d '()')
  if [ -z "$BBOX" ]; then
    echo "$OSM has no bounding box in its header; working it out (a few minutes)"
    BBOX=$(osmium fileinfo --no-progress -e -g data.bbox "$OSM" | tr -d '()')
  fi
  python3 /places.py "$BBOX" "$PLACES"
fi
