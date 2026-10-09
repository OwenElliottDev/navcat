CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      citext UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash  bytea PRIMARY KEY,          -- sha256 of the cookie value; the token itself is never stored
  user_id     bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX ON sessions (user_id);

-- A place as the user saw it, so it survives later OSM edits
CREATE TABLE saved_places (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('home', 'work', 'favourite')),
  label       text NOT NULL,
  name        text NOT NULL,
  address     text,
  osm_type    char(1) CHECK (osm_type IN ('N', 'W', 'R')),
  osm_id      bigint,
  geom        geometry(Point, 4326) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON saved_places (user_id);
CREATE UNIQUE INDEX saved_places_one_home_one_work ON saved_places (user_id, kind)
  WHERE kind IN ('home', 'work');

CREATE TABLE recent_searches (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  key         text NOT NULL,              -- what makes two searches the same, e.g. 'osm:N123' or 'category:cafe'
  query       text NOT NULL,
  category    text,
  place       jsonb,
  searched_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (user_id, key)
);
CREATE INDEX ON recent_searches (user_id, searched_at DESC);
