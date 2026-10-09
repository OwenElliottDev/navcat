#!/bin/sh
# Downloads the GTFS timetables OpenTripPlanner builds its graph from, and gives it the streets
# around them (for walking to and from stops): cut from the OSM extract maps-download already
# fetched, or downloaded from TRANSIT_OSM_URL if that's set. transit_prepare.py works out the
# area to cut, moves feeds into one time zone and writes OTP's build-config.json.
#
# Everything goes into download/ first and only replaces the current files once it's all
# there, so a failed download leaves the last good set in place.
set -eu
. /fetch.sh
cd /data
rm -rf download && mkdir download && cd download

feed=0
for url in $TRANSIT_GTFS_URLS; do
  feed=$((feed + 1))
  echo "Downloading timetables: $url"
  fetch download.zip "$url"

  rm -rf unpacked && mkdir unpacked
  python3 -m zipfile -e download.zip unpacked
  nested=$(find unpacked -iname '*.zip')

  if [ -n "$nested" ]; then
    # A zip of GTFS zips, e.g. PTV's 1/google_transit.zip, 2/google_transit.zip, ...
    for zip in $nested; do
      mv "$zip" "gtfs-$feed-$(echo "${zip#unpacked/}" | tr '/' '-')"
    done
  else
    mv download.zip "gtfs-$feed.zip"
  fi
  rm -rf unpacked download.zip
done

python3 /transit_prepare.py

if [ -n "${TRANSIT_OSM_URL:-}" ]; then
  echo "Downloading street map: $TRANSIT_OSM_URL"
  fetch streets.osm.pbf "$TRANSIT_OSM_URL"
else
  echo "Cutting the streets around the stops from $OSM_FILE"
  osmium extract --no-progress --overwrite --polygon streets.geojson -o streets.osm.pbf "/osm/$OSM_FILE"
fi
rm streets.geojson

# OTP picks up every zip with "gtfs" in its name
cd /data
rm -f ./*gtfs*.zip
mv download/* .
rmdir download

echo "Done:"
ls -lh ./*.pbf ./*gtfs*.zip
