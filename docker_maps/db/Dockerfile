# Built on postgres rather than postgis/postgis, which is amd64-only
FROM postgres:17

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-17-postgis-3 osm2pgsql osmium-tool \
    && rm -rf /var/lib/apt/lists/*

COPY import-pois.sh pois.lua places-prepare.sql places-match.sql places-merge.sql /import/
