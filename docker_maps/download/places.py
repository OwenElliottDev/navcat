"""Downloads Overture Maps places in a bounding box to a gzipped CSV for the POI import.

Usage: places.py WEST,SOUTH,EAST,NORTH OUTPUT.csv.gz

Keeps places with a confidence above 0.7 (below that there's a lot of junk: home businesses,
spam listings) and, when OVERTURE_COUNTRIES is set, only those whose address is in one of those
countries, so a rectangular box doesn't pull in neighbouring countries. Turning Overture's
categories into the app's is left to the import (db/places-prepare.sql), so it can change offline.
"""

import os
import sys

import duckdb

MIN_CONFIDENCE = 0.7
CATALOG = "https://stac.overturemaps.org/catalog.json"
PLACES = "s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"

# One row per place, flattened to what the app shows. Only a place's first phone, website and
# address are kept. bbox is a point's own position, and filtering on it lets DuckDB skip the
# parts of the (global) dataset outside the area.
QUERY = """
SELECT
  id,
  names.primary AS name,
  taxonomy.primary AS category,
  basic_category,
  taxonomy.hierarchy[1] AS top_category,
  round(confidence, 3) AS confidence,
  sources[1].dataset AS source,
  brand.names.primary AS brand,
  brand.wikidata AS brand_wikidata,
  phones[1] AS phone,
  websites[1] AS website,
  emails[1] AS email,
  list_filter(socials, s -> s ILIKE '%facebook.com/%')[1] AS facebook,
  addresses[1].freeform AS street,
  addresses[1].locality AS locality,
  addresses[1].postcode AS postcode,
  addresses[1].region AS region,
  bbox.xmin AS lng,
  bbox.ymin AS lat
FROM read_parquet($path)
WHERE bbox.xmin BETWEEN $west AND $east
  AND bbox.ymin BETWEEN $south AND $north
  AND confidence > $min_confidence
  AND names.primary IS NOT NULL
  AND taxonomy.primary IS NOT NULL
  AND ($countries = [] OR addresses[1].country IS NULL OR addresses[1].country IN $countries)
"""


def main() -> None:
    bbox, output = sys.argv[1:]
    west, south, east, north = (float(n) for n in bbox.split(","))
    countries = os.environ.get("OVERTURE_COUNTRIES", "").upper().replace(",", " ").split()

    db = duckdb.connect()
    db.sql("LOAD httpfs; SET s3_region = 'us-west-2'; SET enable_progress_bar = false")

    release = (
        os.environ.get("OVERTURE_RELEASE")
        or (db.sql(f"SELECT latest FROM read_json('{CATALOG}')").fetchone()[0])
    )
    where = f"{west},{south},{east},{north}" + (f" in {', '.join(countries)}" if countries else "")
    print(f"Downloading Overture places from release {release} ({where})", flush=True)

    # COPY returns the number of rows written
    (count,) = db.execute(
        f"COPY ({QUERY}) TO '{output}.tmp' (FORMAT csv, HEADER, COMPRESSION gzip)",
        {
            "path": PLACES.format(release=release),
            "west": west,
            "south": south,
            "east": east,
            "north": north,
            "min_confidence": MIN_CONFIDENCE,
            "countries": countries,
        },
    ).fetchone()
    os.replace(f"{output}.tmp", output)
    print(f"Saved {count} places to {output}")


if __name__ == "__main__":
    main()
