# Postgres with PostGIS, plus osm2pgsql and osmium for importing POIs.
# Built from the multi-arch postgres image because postgis/postgis is amd64-only.
FROM postgres:17

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-17-postgis-3 osm2pgsql osmium-tool \
    && rm -rf /var/lib/apt/lists/*

# The POI import (maps-poi-import runs import-pois.sh)
COPY import-pois.sh pois.lua places-prepare.sql places-match.sql places-merge.sql /import/
