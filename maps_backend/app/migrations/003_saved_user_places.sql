-- Saved places can also be places people added (type 'U')
ALTER TABLE saved_places DROP CONSTRAINT saved_places_osm_type_check;
ALTER TABLE saved_places ADD CONSTRAINT saved_places_osm_type_check CHECK (osm_type IN ('N', 'W', 'R', 'U'));
