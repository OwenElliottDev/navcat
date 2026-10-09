-- Places from Overture Maps that OSM doesn't have are place type 'O' (numbered by the POI
-- import's overture_ids table), so they can be corrected, reviewed, photographed and saved.
ALTER TABLE place_edits DROP CONSTRAINT place_edits_osm_type_check;
ALTER TABLE place_edits ADD CONSTRAINT place_edits_osm_type_check CHECK (osm_type IN ('N', 'W', 'R', 'O'));
ALTER TABLE reviews DROP CONSTRAINT reviews_place_type_check;
ALTER TABLE reviews ADD CONSTRAINT reviews_place_type_check CHECK (place_type IN ('N', 'W', 'R', 'U', 'O'));
ALTER TABLE photos DROP CONSTRAINT photos_place_type_check;
ALTER TABLE photos ADD CONSTRAINT photos_place_type_check CHECK (place_type IN ('N', 'W', 'R', 'U', 'O'));
ALTER TABLE saved_places DROP CONSTRAINT saved_places_osm_type_check;
ALTER TABLE saved_places ADD CONSTRAINT saved_places_osm_type_check CHECK (osm_type IN ('N', 'W', 'R', 'U', 'O'));
