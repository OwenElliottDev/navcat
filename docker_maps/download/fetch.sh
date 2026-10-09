# fetch FILE URL: downloads with retries, giving up on a stalled connection rather than
# waiting forever. Sourced by download.sh and transit.sh.
fetch() {
  curl --fail --location --progress-bar --retry 5 --retry-all-errors \
    --speed-time 60 --speed-limit 1000 -o "$1" "$2"
}
