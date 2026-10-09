-- Merging Overture Maps places into pois_import, the OSM POIs osm2pgsql just wrote, step 1 of 3.
-- import-pois.sh loads the places downloaded by maps-download into overture_import, then runs
-- places-prepare.sql, places-match.sql (several at once, each on a share of the places) and
-- places-merge.sql.
--
-- A place OSM already has (nearby, with a similar name) fills in the OSM place's missing phone,
-- website and address. Every other place is added as place type 'O'.
--
-- This step puts both sides in a form that's quick to compare: overture_places and osm_places.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Overture's ids are 128-bit strings and the app numbers places with a bigint, so each Overture
-- place gets a number here. Kept between imports, so reviews, photos and saved places stay with
-- their place.
CREATE TABLE IF NOT EXISTS overture_ids (
  gers_id text PRIMARY KEY,
  id      bigint GENERATED ALWAYS AS IDENTITY UNIQUE
);

-- Overture categories that mean one of the OSM values browse uses (categories.py). The specific
-- category is checked first, then the broader basic_category. Anything else keeps Overture's
-- own name for it (e.g. "barber"), so it's searchable but not in a browse category.
DROP TABLE IF EXISTS overture_places, osm_places, overture_matches, overture_category_map;
CREATE UNLOGGED TABLE overture_category_map (overture text, field text, osm text, PRIMARY KEY (overture, field));
INSERT INTO overture_category_map VALUES
  -- specific categories
  ('coffee_shop', 'category', 'cafe'),
  ('coffee_roastery', 'category', 'cafe'),
  ('pub', 'category', 'pub'),
  ('gastropub', 'category', 'pub'),
  ('beer_garden', 'category', 'biergarten'),
  ('grocery_store', 'category', 'supermarket'),
  ('supermarket', 'category', 'supermarket'),
  ('bakery', 'category', 'bakery'),
  ('pharmacy', 'category', 'pharmacy'),
  ('drugstore', 'category', 'pharmacy'),
  ('doctors_office', 'category', 'doctors'),
  ('family_practice', 'category', 'doctors'),
  ('public_health_clinic', 'category', 'clinic'),
  ('walk_in_clinic', 'category', 'clinic'),
  ('urgent_care_clinic', 'category', 'clinic'),
  ('post_office', 'category', 'post_office'),
  ('motel', 'category', 'motel'),
  ('hostel', 'category', 'hostel'),
  ('guest_house', 'category', 'guest_house'),
  ('bed_and_breakfast', 'category', 'guest_house'),
  ('hardware_store', 'category', 'hardware'),
  ('hardware_home_and_garden_store', 'category', 'hardware'),
  ('home_improvement_store', 'category', 'doityourself'),
  ('bike_store', 'category', 'bicycle'),
  ('bike_repair_maintenance', 'category', 'bicycle'),
  -- broader categories
  ('cafe', 'basic', 'cafe'),
  ('coffee_shop', 'basic', 'cafe'),
  ('restaurant', 'basic', 'restaurant'),
  ('fast_food_restaurant', 'basic', 'fast_food'),
  ('bar', 'basic', 'bar'),
  ('convenience_store', 'basic', 'convenience'),
  ('dental_clinic', 'basic', 'dentist'),
  ('primary_care_or_general_clinic', 'basic', 'doctors'),
  ('hospital', 'basic', 'hospital'),
  ('gas_station', 'basic', 'fuel'),
  ('fueling_station', 'basic', 'fuel'),
  ('ev_charging_station', 'basic', 'charging_station'),
  ('atm', 'basic', 'atm'),
  ('bank_or_credit_union', 'basic', 'bank'),
  ('public_restroom', 'basic', 'toilets'),
  ('park', 'basic', 'park'),
  ('playground', 'basic', 'playground'),
  ('gym', 'basic', 'fitness_centre'),
  ('fitness_studio', 'basic', 'fitness_centre'),
  ('library', 'basic', 'library'),
  ('hotel', 'basic', 'hotel'),
  ('museum', 'basic', 'museum'),
  ('art_gallery', 'basic', 'gallery'),
  ('movie_theater', 'basic', 'cinema');

-- A name boiled down for matching: no accents, punctuation, suburb or generic words, so
-- "Palm Sugar Thai Cafe" matches "Palm Sugar" and "Total Tools South Melbourne" matches
-- "Total Tools". A name that's nothing but generic words ("The Cafe") is kept as it is.
-- (Not temporary functions, so Postgres can use several CPUs for the queries below.)
CREATE OR REPLACE FUNCTION overture_plain(name text) RETURNS text
  IMMUTABLE PARALLEL SAFE LANGUAGE sql AS $$
  SELECT trim(regexp_replace(replace(lower(unaccent(name)), '&', ' and '), '[^a-z0-9]+', ' ', 'g'))
$$;
CREATE OR REPLACE FUNCTION overture_match_name(name text, suburb text) RETURNS text
  IMMUTABLE PARALLEL SAFE LANGUAGE sql AS $$
  SELECT coalesce(
    nullif(trim(regexp_replace(
      replace(' ' || overture_plain(name) || ' ', ' ' || coalesce(nullif(overture_plain(suburb), ''), '#') || ' ', ' '),
      '\m(the|and|restaurant|cafe|coffee|espresso|bar|kitchen|eatery|bistro|hotel|store|shop|pty|ltd|co|cbd)\M',
      '', 'g')), ''),
    overture_plain(name))
$$;

-- The places as they'll be stored: category mapped, tags in OSM's style. Rivers, mountains and
-- the like are left out; OSM maps those as lines and areas, which a point can't improve on.
SET max_parallel_workers_per_gather = 8;
CREATE UNLOGGED TABLE overture_places AS
SELECT
  o.id AS gers_id,
  o.name,
  overture_match_name(o.name, o.locality) AS match_name,
  coalesce(specific.osm, basic.osm, o.category) AS category,
  o.brand_wikidata,
  ST_SetSRID(ST_MakePoint(o.lng, o.lat), 4326) AS geom,
  jsonb_strip_nulls(jsonb_build_object(
    'name', o.name,
    'phone', o.phone,
    'website', o.website,
    'email', o.email,
    'contact:facebook', o.facebook,
    'brand', o.brand,
    'brand:wikidata', o.brand_wikidata,
    -- "31 Emu Bay Rd" splits into number and street; anything else ("Shop 17, Booval Fair")
    -- is kept whole as the street
    'addr:housenumber', address[1],
    'addr:street', coalesce(address[2], o.street),
    'addr:suburb', o.locality,
    'addr:postcode', o.postcode,
    'addr:state', o.region,
    -- "thai_restaurant" -> cuisine "thai"
    'cuisine', CASE WHEN o.basic_category = 'restaurant' AND o.category LIKE '%\_restaurant'
                    THEN left(o.category, -length('_restaurant')) END,
    'overture:source', o.source
  )) AS tags
FROM overture_import o
LEFT JOIN overture_category_map specific ON specific.overture = o.category AND specific.field = 'category'
LEFT JOIN overture_category_map basic ON basic.overture = o.basic_category AND basic.field = 'basic'
CROSS JOIN LATERAL (
  SELECT regexp_match(o.street, '^(\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?) +(\D.*)$') AS address
) AS split
WHERE o.top_category IS DISTINCT FROM 'geographic_entities';

DROP TABLE overture_import;

-- The OSM places they might duplicate
CREATE UNLOGGED TABLE osm_places AS
SELECT osm_type, osm_id, category, tags->>'brand:wikidata' AS brand_wikidata, geom,
       overture_match_name(name, coalesce(tags->>'addr:suburb', tags->>'addr:city')) AS match_name
FROM pois_import
WHERE name IS NOT NULL;
CREATE INDEX ON osm_places USING gist (geom);
ANALYZE osm_places;

-- Filled by places-match.sql
CREATE UNLOGGED TABLE overture_matches (
  gers_id  text NOT NULL,
  osm_type char(1) NOT NULL,
  osm_id   bigint NOT NULL,
  score    real NOT NULL
);
