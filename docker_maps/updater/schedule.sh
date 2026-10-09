#!/bin/sh
# Writes the update schedules (cron syntax, local time in TZ) into a crontab and runs cron.
# An empty schedule turns that update off. Updates log to this container's output.
set -eu

CRONTAB=/etc/crontabs/root
: > "$CRONTAB"

add() {
  if [ -n "$1" ]; then
    echo "$1 cd '$MAPS_PROJECT_DIR' && ./maps update $2 > /proc/1/fd/1 2>&1" >> "$CRONTAB"
  fi
}
add "${UPDATE_TRANSIT_SCHEDULE:-}" transit
add "${UPDATE_MAP_SCHEDULE:-}" "map search"

echo "Updates scheduled ($(date +%Z)):"
cat "$CRONTAB"
exec crond -f -l 8
