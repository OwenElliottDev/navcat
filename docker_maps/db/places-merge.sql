-- Merging Overture Maps places, step 3 of 3 (see places-prepare.sql).

-- Fill in what the OSM place is missing, from its best-matching Overture place. OSM's own
-- tags always win, and an address only comes over whole, so two addresses don't get mixed.
WITH best AS (
  SELECT DISTINCT ON (m.osm_type, m.osm_id) m.osm_type, m.osm_id, o.tags
  FROM overture_matches m JOIN overture_places o USING (gers_id)
  ORDER BY m.osm_type, m.osm_id, m.score DESC
)
UPDATE pois_import p
SET tags = jsonb_strip_nulls(jsonb_build_object(
      'phone', CASE WHEN NOT p.tags ?| array['phone', 'contact:phone'] THEN best.tags->'phone' END,
      'website', CASE WHEN NOT p.tags ?| array['website', 'contact:website'] THEN best.tags->'website' END,
      'email', CASE WHEN NOT p.tags ?| array['email', 'contact:email'] THEN best.tags->'email' END
    ))
    || CASE WHEN p.tags ? 'addr:street' THEN '{}'
            ELSE (SELECT coalesce(jsonb_object_agg(key, value), '{}')
                  FROM jsonb_each(best.tags) WHERE key LIKE 'addr:%')
       END
    || p.tags
FROM best
WHERE p.osm_type = best.osm_type AND p.osm_id = best.osm_id;

-- Everything OSM doesn't have
CREATE TEMP TABLE overture_unmatched AS
SELECT * FROM overture_places o
WHERE NOT EXISTS (SELECT FROM overture_matches m WHERE m.gers_id = o.gers_id);

INSERT INTO overture_ids (gers_id)
SELECT gers_id FROM overture_unmatched
ON CONFLICT DO NOTHING;

INSERT INTO pois_import (osm_type, osm_id, name, category, tags, geom)
SELECT 'O', i.id, o.name, o.category, o.tags, o.geom
FROM overture_unmatched o JOIN overture_ids i USING (gers_id);

-- For search by name, nearest first (Photon only knows OSM's places)
CREATE INDEX ON pois_import USING gin (name gin_trgm_ops) WHERE osm_type = 'O';
CREATE INDEX ON pois_import USING gist (geom) WHERE osm_type = 'O';

SELECT (SELECT count(*) FROM overture_places) AS overture_places,
       (SELECT count(DISTINCT (osm_type, osm_id)) FROM overture_matches) AS osm_places_matched,
       (SELECT count(*) FROM pois_import WHERE osm_type = 'O') AS places_added;

DROP TABLE overture_places, overture_unmatched, osm_places, overture_matches, overture_category_map;
