# Downloads the data everything else is built from: the OSM extract, and Overture Maps places
# for the same area. Only used for setup and updates; the running stack never goes online.
FROM python:3.13-slim

# osmium reads the extract's bounding box; curl downloads it
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl osmium-tool \
    && rm -rf /var/lib/apt/lists/*

# DuckDB reads Overture's GeoParquet straight from S3, fetching only the area's rows
RUN pip install --no-cache-dir duckdb==1.5.6 pycurl==7.48.0 \
    && python -c "import duckdb; duckdb.connect().install_extension('httpfs')"

COPY download.sh fetch.sh places.py status.py transit.sh transit_prepare.py /
ENTRYPOINT ["sh", "/download.sh"]
