"""The real app, run with uvicorn against a fresh database, and pycurl clients to call it.

Needs TEST_DATABASE_URL: a Postgres server with PostGIS where these tests may create and drop
a database (`maps_api_test`). tests/api/run.sh starts one in Docker and sets it.
"""

import contextlib
import itertools
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import psycopg
import pycurl
import pytest
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from tests.client import Client

ADMIN_URL = os.environ.get("TEST_DATABASE_URL")
TEST_DB = "maps_api_test"
BACKEND_DIR = Path(__file__).resolve().parents[2]

if not ADMIN_URL:
    pytest.skip(
        "API tests need TEST_DATABASE_URL (run `sh tests/api/run.sh` to use a Docker database)",
        allow_module_level=True,
    )


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def database_url() -> str:
    with psycopg.connect(ADMIN_URL, autocommit=True) as conn:
        conn.execute(
            sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(TEST_DB))
        )
        conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(TEST_DB)))
    params = conninfo_to_dict(ADMIN_URL)
    params["dbname"] = TEST_DB
    return make_conninfo(**params)


@pytest.fixture(scope="session")
def photos_dir(tmp_path_factory) -> Path:
    return tmp_path_factory.mktemp("photos")


@pytest.fixture(scope="session")
def base_url(database_url, photos_dir):
    """Starts the backend. Migrations run on startup, so this also checks they apply to an
    empty database."""
    port = _free_port()
    env = {
        **os.environ,
        "DATABASE_URL": database_url,
        "PHOTOS_DIR": str(photos_dir),
        # Nothing listens here, so road data finds GraphHopper down
        "GRAPHHOPPER_URL": f"http://127.0.0.1:{_free_port()}",
        "ALLOW_SIGNUP": "true",
    }
    log_path = photos_dir.parent / "uvicorn.log"
    with open(log_path, "w") as log:
        server = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(port)],
            cwd=BACKEND_DIR,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
    url = f"http://127.0.0.1:{port}"
    try:
        _wait_until_up(server, url, log_path)
        yield url
    finally:
        server.terminate()
        server.wait(10)


def _wait_until_up(server: subprocess.Popen, url: str, log_path: Path) -> None:
    deadline = time.monotonic() + 30
    while server.poll() is None and time.monotonic() < deadline:
        with contextlib.suppress(pycurl.error):
            if Client(url).get("/api/health").status == 200:
                return
        time.sleep(0.2)
    pytest.fail(f"The backend didn't start:\n{log_path.read_text()}")


@pytest.fixture(scope="session")
def db(base_url, database_url):
    """A direct connection, for setting up data and checking what the API stored."""
    with psycopg.connect(database_url, autocommit=True, row_factory=psycopg.rows.dict_row) as conn:
        yield conn


# Places around a spot in Melbourne. pois and turn_lanes are made by the POI import, not by
# migrations, so they're created here in the same shape (see docker_maps/db/pois.lua).
CENTRE = (145.0, -37.8)

POIS = [
    # osm_type, osm_id, name, category, extra tags, lng, lat
    ("N", 1, "Cafe One", "cafe", {"amenity": "cafe", "phone": "+61 3 0000 0001"}, 145.000, -37.800),
    ("N", 2, "Cafe Two", "cafe", {"amenity": "cafe"}, 145.002, -37.800),
    ("N", 3, "Cafe Far", "cafe", {"amenity": "cafe"}, 145.010, -37.800),
    ("W", 4, "The Pub", "pub", {"amenity": "pub"}, 145.001, -37.801),
    ("N", 5, "Bread Shop", "bakery", {"shop": "bakery"}, 145.001, -37.799),
    ("N", 6, "Outside Cafe", "cafe", {"amenity": "cafe"}, 146.0, -38.0),
    ("O", 1, "Overture Coffee", "cafe", {"phone": "+61 3 0000 0009"}, 145.003, -37.800),
    ("O", 2, "Juice 100% Bar", "cafe", {}, 145.004, -37.800),
    ("O", 3, "Juice 1000 Bar", "cafe", {}, 145.004, -37.801),
    ("O", 4, "Snack_Shack", "fast_food", {}, 145.005, -37.800),
    ("O", 5, "SnackXShack", "fast_food", {}, 145.005, -37.801),
]

# way_id, lanes, forward, backward, oneway, line drawn west to east
TURN_LANES = [
    (10, None, "left|through", "through|right", None),
    (11, "left|left;through", None, None, "yes"),
    (12, "through|right", None, None, "-1"),
    (13, "left|through", None, None, None),  # says nothing about direction
]
WAY_WEST = (145.0, -37.8)
WAY_EAST = (145.01, -37.8)


@pytest.fixture(scope="session")
def places(db):
    db.execute(
        "CREATE TABLE pois (osm_type char(1) NOT NULL, osm_id bigint NOT NULL, name text,"
        " category text NOT NULL, tags jsonb NOT NULL, geom geometry(Point, 4326) NOT NULL)"
    )
    for osm_type, osm_id, name, category, tags, lng, lat in POIS:
        db.execute(
            "INSERT INTO pois VALUES (%s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))",
            (
                osm_type,
                osm_id,
                name,
                category,
                psycopg.types.json.Jsonb({"name": name, **tags}),
                lng,
                lat,
            ),
        )
    db.execute(
        "CREATE TABLE turn_lanes (way_id bigint NOT NULL, lanes text, forward text, backward text,"
        " oneway text, geom geometry(LineString, 4326) NOT NULL)"
    )
    for way_id, lanes, forward, backward, oneway in TURN_LANES:
        db.execute(
            "INSERT INTO turn_lanes VALUES (%s, %s, %s, %s, %s,"
            " ST_SetSRID(ST_MakeLine(ST_MakePoint(%s, %s), ST_MakePoint(%s, %s)), 4326))",
            (way_id, lanes, forward, backward, oneway, *WAY_WEST, *WAY_EAST),
        )
    return POIS


@pytest.fixture
def no_places(db, places):
    """As before the POI import has run."""
    db.execute("ALTER TABLE pois RENAME TO pois_hidden")
    db.execute("ALTER TABLE turn_lanes RENAME TO turn_lanes_hidden")
    yield
    db.execute("ALTER TABLE pois_hidden RENAME TO pois")
    db.execute("ALTER TABLE turn_lanes_hidden RENAME TO turn_lanes")


_ids = itertools.count(1)


@pytest.fixture
def client(base_url):
    """Someone with no account yet. Each gets its own address, so login throttling for one
    test doesn't block another."""

    def make() -> Client:
        n = next(_ids)
        return Client(base_url, headers={"x-real-ip": f"10.0.{n // 250}.{n % 250}"})

    return make


@pytest.fixture
def user(client):
    """Signs up someone new and returns their client (with the session cookie)."""

    def make(password: str = "correct horse") -> Client:
        c = client()
        c.username = f"user{next(_ids)}"
        response = c.post("/api/auth/signup", {"username": c.username, "password": password})
        assert response.status == 201, response.body
        return c

    return make
