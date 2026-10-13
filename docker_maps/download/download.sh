#!/bin/sh
# Downloads the OSM extract that GraphHopper, Planetiler and the POI import read, then the
# SRTM elevation for its area (GraphHopper and the terrain) and Overture Maps places for it
# (merged into browse and search by the POI import). OSM_URL can list several extracts, which
# are merged into one.
#
#   download.sh            all three
#   download.sh osm        just the OSM extract
#   download.sh elevation  just any elevation files missing, for the extract already downloaded
#   download.sh places     just the places, for the extract already downloaded
#   download.sh check      exits 1 if the extract was downloaded from other URLs than OSM_URL
#
# With OSM_REUSE=true (./maps setup), an extract already in /osm from the same URL is used instead
# of downloading it again, e.g. when one is added to OSM_URL. Each extract's URLs are kept beside
# it in NAME.urls; Geofabrik's also name their source in their header.
#
# Files are downloaded under a temporary name and swapped in when complete, so running
# services keep using the old ones until then.
set -eu
. /fetch.sh
cd /osm

OSM="$OSM_FILE"
PLACES="${OSM_FILE%.osm.pbf}.places.csv.gz"
BOXES="${OSM_FILE%.osm.pbf}.boxes"
URLS="${OSM_FILE%.osm.pbf}.urls"
WHAT="${1:-all}"

# The areas an extract covers, one WEST,SOUTH,EAST,NORTH per line, none crossing the 180th
# meridian. Usually the box in its header (split in two if it crosses), but some extracts that
# cross (e.g. New Zealand, with the Chatham Islands) give the whole world's width, so then (or
# with no box) each side of Greenwich is measured from the data.
find_boxes() {
  box=$(osmium fileinfo --no-progress -F pbf -g header.boxes "$1" | head -n 1 | tr -d '()')
  if [ -n "$box" ] && echo "$box" | awk -F, '{ exit !($3 - $1 < 358) }'; then
    echo "$box" | awk -F, -v OFS=, '
      $3 < $1 { print $1, $2, 180, $4; print -180, $2, $3, $4; next }
      { print }'
    return
  fi
  echo "Working out the area $1 covers (a few minutes)" >&2
  for half in -180,-90,0,90 0,-90,180,90; do
    osmium extract --no-progress -s simple -b "$half" -F pbf "$1" \
      -f pbf,pbf_compression=none -o - \
      | osmium fileinfo --no-progress -e -g data.bbox -F pbf - | tr -d '()' | grep '[0-9]' || true
  done
}

# The URLs an extract in /osm was downloaded from, one per line, if known
sources() {
  urls="${1%.osm.pbf}.urls"
  if [ -f "$urls" ]; then
    cat "$urls"
  else
    # Geofabrik's X-latest.osm.pbf has X-updates as its replication URL
    osmium fileinfo --no-progress -g header.option.osmosis_replication_base_url "$1" \
      | sed -n 's|^\(https://download\.geofabrik\.de/.*\)-updates$|\1-latest.osm.pbf|p'
  fi
}

# The URL an extract in /osm was downloaded from, if it came from just one
source_url() {
  from=$(sources "$1")
  [ "$(echo "$from" | wc -l)" -eq 1 ] && echo "$from"
}

# Downloads an extract to a file, or with OSM_REUSE=true links one already here from that URL
get_extract() {
  if [ "${OSM_REUSE:-}" = true ]; then
    for have in *.osm.pbf; do
      if [ -f "$have" ] && [ "$(source_url "$have")" = "$2" ]; then
        echo "Using $have, already downloaded from $2"
        ln -f "$have" "$1" 2>/dev/null || cp "$have" "$1"
        return
      fi
    done
  fi
  echo "Downloading $2"
  fetch "$1" "$2"
}

set -f
# shellcheck disable=SC2086 # split into URLs
set -- $OSM_URL
set +f

if [ "$WHAT" = check ]; then
  # Unknown (an extract from elsewhere, downloaded before the URLs were kept) counts as the same
  from=$(sources "$OSM" | sort)
  [ -z "$from" ] || [ "$from" = "$(printf '%s\n' "$@" | sort)" ]
  exit
fi

if [ "$WHAT" = all ] || [ "$WHAT" = osm ]; then
  parts=""
  stamps=""
  i=0
  : > "$BOXES.tmp"
  for url in "$@"; do
    i=$((i + 1))
    get_extract "part$i.osm.pbf.tmp" "$url"
    parts="$parts part$i.osm.pbf.tmp"
    # Each extract's own area, as a merged one has no box in its header
    find_boxes "part$i.osm.pbf.tmp" >> "$BOXES.tmp"
    stamps="$stamps$(osmium fileinfo --no-progress -F pbf \
      -g header.option.osmosis_replication_timestamp "part$i.osm.pbf.tmp")
"
  done
  if [ ! -s "$BOXES.tmp" ]; then
    echo "Couldn't read the area $OSM_URL covers" >&2
    exit 1
  fi
  if [ $# -eq 1 ]; then
    mv part1.osm.pbf.tmp "$OSM.tmp"
  else
    # The data's date (for ./maps status), if every extract has one: the oldest of them
    oldest=""
    if [ "$(printf '%s' "$stamps" | grep -c .)" -eq $# ]; then
      oldest=$(printf '%s' "$stamps" | sort | head -n 1)
    fi
    echo "Merging the $# extracts"
    # Where they overlap, objects that changed between their downloads would be in twice;
    # time-filter keeps the newest version of each
    # shellcheck disable=SC2086 # file names without spaces
    osmium merge --no-progress -F pbf $parts -f pbf,pbf_compression=none -o - \
      | osmium time-filter --no-progress --overwrite -F pbf - -f pbf -o "$OSM.tmp" \
        ${oldest:+--output-header="osmosis_replication_timestamp=$oldest"}
    # shellcheck disable=SC2086
    rm -f $parts
  fi
  printf '%s\n' "$@" > "$URLS.tmp"
  mv "$OSM.tmp" "$OSM"
  mv "$URLS.tmp" "$URLS"
  mv "$BOXES.tmp" "$BOXES"
fi

# Extracts downloaded before the boxes were kept
if [ ! -s "$BOXES" ]; then
  find_boxes "$OSM" > "$BOXES.tmp"
  if [ ! -s "$BOXES.tmp" ]; then
    echo "Couldn't read the area $OSM covers" >&2
    exit 1
  fi
  mv "$BOXES.tmp" "$BOXES"
fi
BBOXES=$(cat "$BOXES")

# The boxes as an Osmosis polygon, for Planetiler: without one it takes its bounds from the
# extract, and a merged extract or one crossing the 180th meridian gives the whole world's width
awk -F, '{
  print NR; print $1, $2; print $3, $2; print $3, $4; print $1, $4; print $1, $2; print "END"
} BEGIN { print "area" } END { print "END" }' "$BOXES" > "$OSM.poly"

if [ "$WHAT" = all ] || [ "$WHAT" = elevation ]; then
  # Only the terrain depends on all of it, so a failure here shouldn't stop the rest
  # shellcheck disable=SC2086 # one argument per box
  python3 /elevation.py /srtm $BBOXES \
    || echo "Some elevation is missing; the topo map will show those areas at sea level"
fi

if [ "$WHAT" = all ] || [ "$WHAT" = places ]; then
  if [ "${OVERTURE_PLACES:-true}" != true ]; then
    echo "OVERTURE_PLACES isn't true: skipping places"
    rm -f "$PLACES"
    exit 0
  fi
  # shellcheck disable=SC2086 # one argument per box
  python3 /places.py "$PLACES" $BBOXES
fi
