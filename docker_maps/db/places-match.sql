-- Merging Overture Maps places, step 2 of 3 (see places-prepare.sql). import-pois.sh runs
-- several of these at once, setting :worker (0, 1, ...) and :workers, the number of them; each
-- matches its share of the places.
--
-- Each Overture place's best match in OSM, if it has one, from the 25 OSM places nearest it:
-- a similar name nearby, the same kind of place with one name inside the other ("Oli & Levi"
-- and "Oli & Levi Galleria" cafes), or the same brand very close by. Very similar names can be
-- further apart, since OSM puts a big park or hospital at its middle.
INSERT INTO overture_matches (gers_id, osm_type, osm_id, score)
SELECT o.gers_id, m.osm_type, m.osm_id, m.score
FROM overture_places o
CROSS JOIN LATERAL (
  SELECT p.osm_type, p.osm_id, p.score, p.distance
  FROM (
    SELECT p.*, similarity(p.match_name, o.match_name) AS score,
           ST_DistanceSphere(p.geom, o.geom) AS distance
    FROM osm_places p
    ORDER BY p.geom <-> o.geom
    LIMIT 25
  ) AS p
  WHERE (p.score >= 0.85 AND p.distance <= 250)
     OR (p.score >= 0.6 AND p.distance <= 100)
     OR (p.category = o.category AND p.distance <= 100
         AND (' ' || p.match_name || ' ' LIKE '% ' || o.match_name || ' %'
              OR ' ' || o.match_name || ' ' LIKE '% ' || p.match_name || ' %'))
     OR (p.brand_wikidata = o.brand_wikidata AND p.distance <= 75)
  ORDER BY score DESC, p.distance
  LIMIT 1
) AS m
WHERE abs(hashtext(o.gers_id)) % :workers = :worker;
