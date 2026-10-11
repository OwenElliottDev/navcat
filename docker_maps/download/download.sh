#!/bin/sh
# Downloads the OSM extract that GraphHopper, Planetiler and the POI import read, then the
# SRTM elevation for its area (GraphHopper and the terrain) and Overture Maps places for it
# (merged into browse and search by the POI import).
#
#   download.sh            all three
#   download.sh osm        just the OSM extract
#   download.sh elevation  just any elevation files missing, for the extract already downloaded
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

if [ "$WHAT" != osm ]; then
  BBOX=$(osmium fileinfo --no-progress -g header.boxes "$OSM" | head -n 1 | tr -d '()')
  if [ -z "$BBOX" ]; then
    echo "$OSM has no bounding box in its header; working it out (a few minutes)"
    BBOX=$(osmium fileinfo --no-progress -e -g data.bbox "$OSM" | tr -d '()')
  fi
  if [ -z "$BBOX" ]; then
    echo "Couldn't read the area $OSM covers" >&2
    exit 1
  fi
fi

if [ "$WHAT" = all ] || [ "$WHAT" = elevation ]; then
  # Only the terrain depends on all of it, so a failure here shouldn't stop the rest
  python3 /elevation.py "$BBOX" /srtm \
    || echo "Some elevation is missing; the topo map will show those areas at sea level"
fi

if [ "$WHAT" = all ] || [ "$WHAT" = places ]; then
  if [ "${OVERTURE_PLACES:-true}" != true ]; then
    echo "OVERTURE_PLACES isn't true: skipping places"
    rm -f "$PLACES"
    exit 0
  fi
  python3 /places.py "$BBOX" "$PLACES"
fi
