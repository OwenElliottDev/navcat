"""Saved places, recent searches and deleting an account."""

from pathlib import Path

from tests.images import phone_photo

HOME = {"kind": "home", "label": "Home", "name": "12 Some St", "lng": 145.0, "lat": -37.8}


def place(kind: str, label: str, **extra) -> dict:
    return {"kind": kind, "label": label, "name": label, "lng": 145.0, "lat": -37.8, **extra}


def test_saving_home_again_replaces_it(user):
    c = user()
    first = c.post("/api/me/places", HOME)
    assert first.status == 201
    c.post("/api/me/places", {**HOME, "label": "New home", "lng": 145.1})

    homes = [p for p in c.get("/api/me/places").json() if p["kind"] == "home"]
    assert len(homes) == 1
    assert homes[0]["label"] == "New home"
    assert homes[0]["lng"] == 145.1


def test_saved_places_list_home_then_work_then_favourites(user):
    c = user()
    for kind, label in [
        ("favourite", "Fav 1"),
        ("work", "Work"),
        ("favourite", "Fav 2"),
        ("home", "Home"),
    ]:
        assert c.post("/api/me/places", place(kind, label)).status == 201
    assert [p["label"] for p in c.get("/api/me/places").json()] == [
        "Home",
        "Work",
        "Fav 1",
        "Fav 2",
    ]


def test_saved_places_keep_place_references(user):
    c = user()
    for osm_type in ["N", "W", "R", "U", "O"]:
        saved = c.post("/api/me/places", place("favourite", osm_type, osmType=osm_type, osmId=7))
        assert saved.status == 201, saved.body
        assert saved.json()["osmType"] == osm_type
    assert c.post("/api/me/places", place("favourite", "x", osmType="X", osmId=7)).status == 422
    assert c.post("/api/me/places", place("other", "x")).status == 422
    assert c.post("/api/me/places", place("favourite", "x", lat=91)).status == 422


def test_rename_and_delete_only_your_own(user):
    owner, other = user(), user()
    saved = owner.post("/api/me/places", place("favourite", "Mine")).json()
    path = f"/api/me/places/{saved['id']}"

    assert other.patch(path, {"label": "Stolen"}).status == 404
    other.delete(path)
    assert [p["label"] for p in owner.get("/api/me/places").json()] == ["Mine"]

    renamed = owner.patch(path, {"label": "Renamed"})
    assert renamed.status == 200
    assert renamed.json()["label"] == "Renamed"
    assert owner.delete(path).status == 204
    assert owner.get("/api/me/places").json() == []


def test_repeating_a_search_moves_it_to_the_top(user):
    c = user()
    cafe = {"name": "Cafe", "lng": 145.0, "lat": -37.8, "osmType": "N", "osmId": 1}
    c.post("/api/me/recents", [{"query": "caf", "place": cafe}])
    c.post("/api/me/recents", [{"query": "Cafes", "category": "cafe"}])
    recents = c.post("/api/me/recents", [{"query": "cafe one", "place": cafe}]).json()

    assert [r["query"] for r in recents] == ["cafe one", "Cafes"]
    assert recents[0]["place"]["osmId"] == 1
    assert c.get("/api/me/recents").json() == recents


def test_recents_keep_the_newest_fifty(user):
    c = user()
    c.post("/api/me/recents", [{"query": f"search {i}"} for i in range(50)])
    c.post("/api/me/recents", [{"query": f"later {i}"} for i in range(5)])
    recents = c.get("/api/me/recents", params={"limit": 50}).json()

    assert len(recents) == 50
    queries = {r["query"] for r in recents}
    assert {f"search {i}" for i in range(5)}.isdisjoint(queries)  # the oldest went
    assert recents[0]["query"] == "later 4"
    assert len(c.get("/api/me/recents").json()) == 20  # default limit


def test_clear_recents(user):
    c = user()
    c.post("/api/me/recents", [{"query": "pizza"}])
    assert c.delete("/api/me/recents").status == 204
    assert c.get("/api/me/recents").json() == []


def test_deleting_an_account_removes_what_was_saved(user, client, db, photos_dir: Path, places):
    c = user()
    c.post("/api/me/places", HOME)
    c.post("/api/me/recents", [{"query": "pizza"}])
    c.put("/api/places/N/1/review", {"rating": 4})
    photo = c.request(
        "POST", "/api/places/N/1/photos", data=phone_photo(), content_type="image/jpeg"
    )
    photo_id = photo.json()["id"]
    added = c.post(
        "/api/places", {"name": "Left Behind", "category": "cafe", "lng": 145, "lat": -37.8}
    )
    user_id = c.get("/api/me").json()["user"]["id"]
    assert (photos_dir / f"{photo_id}.jpg").exists()

    assert c.delete("/api/me").status == 204
    assert c.get("/api/me").json() == {"user": None}
    login = client().post("/api/auth/login", {"username": c.username, "password": "correct horse"})
    assert login.status == 401

    for table in ("users", "sessions", "saved_places", "recent_searches", "reviews", "photos"):
        column = "id" if table == "users" else "user_id"
        count = db.execute(f"SELECT count(*) AS n FROM {table} WHERE {column} = %s", (user_id,))
        assert count.fetchone()["n"] == 0, table
    assert not (photos_dir / f"{photo_id}.jpg").exists()
    assert not (photos_dir / f"{photo_id}-thumb.jpg").exists()
    # Places they added stay, as other people may have reviewed them
    assert client().get(f"/api/places/U/{added.json()['osmId']}").status == 200
