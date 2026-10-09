-- Places people add themselves (businesses OSM doesn't have yet).
-- The app refers to them as place type 'U', alongside OSM's N/W/R.
CREATE TABLE user_places (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  category    text NOT NULL,              -- an OSM-style value, e.g. 'cafe'
  tags        jsonb NOT NULL DEFAULT '{}',
  geom        geometry(Point, 4326) NOT NULL,
  created_by  bigint REFERENCES users ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  bigint REFERENCES users ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON user_places USING gist (geom);
CREATE INDEX ON user_places (category);

-- Corrections to imported OSM places. Kept apart from pois, which is rebuilt on every
-- import, so they survive. A tag set to '' removes it.
CREATE TABLE place_edits (
  osm_type    char(1) NOT NULL CHECK (osm_type IN ('N', 'W', 'R')),
  osm_id      bigint NOT NULL,
  tags        jsonb NOT NULL,
  updated_by  bigint REFERENCES users ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (osm_type, osm_id)
);

-- One review per person per place; writing again updates it
CREATE TABLE reviews (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  place_type  char(1) NOT NULL CHECK (place_type IN ('N', 'W', 'R', 'U')),
  place_id    bigint NOT NULL,
  user_id     bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_type, place_id, user_id)
);

-- The image files live in PHOTOS_DIR as <id>.jpg and <id>-thumb.jpg
CREATE TABLE photos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  place_type  char(1) NOT NULL CHECK (place_type IN ('N', 'W', 'R', 'U')),
  place_id    bigint NOT NULL,
  user_id     bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  width       int NOT NULL,
  height      int NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON photos (place_type, place_id);
CREATE INDEX ON photos (user_id);
