"""Browse, place details, corrections, places people add, reviews and photos."""

import io
from pathlib import Path

import pytest
from PIL import Image

from tests.images import GPS_INFO, phone_photo

from .conftest import CENTRE

BBOX = "144.99,-37.81,145.02,-37.79"
NEAR = f"{CENTRE[0]},{CENTRE[1]}"


@pytest.fixture(autouse=True)
def _places(places):
    pass


def browse(c, category="cafe", **params):
    return c.get("/api/browse", params={"category": category, "bbox": BBOX, "near": NEAR, **params})


# ---------- browse ----------


def test_browse_finds_a_category_in_the_box_nearest_first(client):
    response = browse(client())
    assert response.status == 200
    results = response.json()["results"]

    names = [r["name"] for r in results]
    assert names[0] == "Cafe One"
    assert "Outside Cafe" not in names  # outside the box
    assert {"The Pub", "Bread Shop"}.isdisjoint(names)  # other categories
    assert "Overture Coffee" in names  # Overture places browse like any other
    distances = [r["distance"] for r in results]
    assert distances == sorted(distances)
    assert distances[0] < 1
    assert results[0]["tags"]["phone"] == "+61 3 0000 0001"
    assert response.json()["truncated"] is False


def test_browse_categories_cover_several_osm_values(client):
    names = [r["name"] for r in browse(client(), "bar").json()["results"]]
    assert names == ["The Pub"]


def test_browse_says_when_there_are_more(client):
    page = browse(client(), limit=2).json()
    assert len(page["results"]) == 2
    assert page["truncated"] is True


def test_browse_rejects_bad_requests(client):
    c = client()
    assert browse(c, "unicorns").status == 404
    assert c.get("/api/browse", params={"category": "cafe", "bbox": "1,2,3"}).status == 422
    assert c.get("/api/browse", params={"category": "cafe", "bbox": "a,b,c,d"}).status == 422
    assert browse(c, limit=201).status == 422


def test_categories_are_listed_in_camel_case(client):
    categories = client().get("/api/browse/categories").json()
    cafe = next(c for c in categories if c["id"] == "cafe")
    assert cafe["osmValues"] == ["cafe"]
    assert "coffee" in cafe["words"]


def test_before_the_poi_import(client, no_places):
    c = client()
    assert browse(c).status == 503
    assert c.get("/api/places/N/1").status == 503
    assert c.get("/api/places/search", params={"q": "cafe"}).status == 503
    approach = {"wayId": 10, "start": [145.0, -37.8], "end": [145.01, -37.8]}
    assert c.post("/api/lanes", {"approaches": [approach]}).status == 503
    assert c.get("/api/health").json()["pois"] is None


# ---------- search ----------


def search(c, q, near=NEAR):
    response = c.get("/api/places/search", params={"q": q, "near": near})
    assert response.status == 200, response.body
    return [r["name"] for r in response.json()]


def test_search_finds_overture_and_added_places_not_osm(client):
    assert search(client(), "juice") == ["Juice 100% Bar", "Juice 1000 Bar"]
    assert search(client(), "cafe one") == []  # OSM places come from Photon


def test_search_treats_like_wildcards_as_text(client):
    assert search(client(), "100%") == ["Juice 100% Bar"]
    assert search(client(), "k_S") == ["Snack_Shack"]


def test_search_puts_names_starting_with_the_text_first(user):
    c = user()
    far = {"name": "Coffee Corner", "category": "cafe", "lng": 146.5, "lat": -38.5}
    added = c.post("/api/places", far)
    assert added.status == 201
    assert search(c, "coffee") == ["Coffee Corner", "Overture Coffee"]
    assert search(c, "coffee", near="146.5,-38.5")[0] == "Coffee Corner"


def test_search_needs_two_characters(client):
    assert client().get("/api/places/search", params={"q": "c"}).status == 422


# ---------- place details and corrections ----------


def test_get_a_place(client):
    c = client()
    cafe = c.get("/api/places/N/1").json()
    assert cafe == {
        "osmType": "N",
        "osmId": 1,
        "name": "Cafe One",
        "category": "cafe",
        "lng": 145.0,
        "lat": -37.8,
        "tags": {"name": "Cafe One", "amenity": "cafe", "phone": "+61 3 0000 0001"},
    }
    assert c.get("/api/places/N/999").status == 404
    assert c.get("/api/places/X/1").status == 422


def test_correcting_an_osm_place(user, client, db):
    c = user()
    response = c.patch("/api/places/N/2", {"name": "Cafe Deux", "tags": {"phone": " 123 "}})
    assert response.status == 200, response.body
    assert response.json()["name"] == "Cafe Deux"
    assert response.json()["tags"]["phone"] == "123"

    # Kept apart from pois (which each import replaces), and applied wherever places show
    edit = db.execute("SELECT tags FROM place_edits WHERE osm_type = 'N' AND osm_id = 2").fetchone()
    assert edit["tags"] == {"name": "Cafe Deux", "phone": "123"}
    assert "Cafe Deux" in [r["name"] for r in browse(client()).json()["results"]]

    # A later correction adds to the earlier one; "" removes a tag
    c.patch("/api/places/N/2", {"tags": {"website": "https://cafe.example"}})
    removed = c.patch("/api/places/N/2", {"tags": {"phone": ""}}).json()
    assert "phone" not in removed["tags"]
    assert removed["tags"]["website"] == "https://cafe.example"
    assert client().get("/api/places/N/2").json() == removed


def test_correcting_an_overture_place(user):
    response = user().patch("/api/places/O/1", {"tags": {"opening_hours": "Mo-Fr 08:00-16:00"}})
    assert response.status == 200, response.body
    assert response.json()["tags"]["opening_hours"] == "Mo-Fr 08:00-16:00"


@pytest.mark.parametrize(
    "changes",
    [
        {"category": "bar"},  # only places people added can change category
        {"tags": {"amenity": "bar"}},  # not an editable tag
        {"tags": {"website": "javascript:alert(1)"}},
        {"tags": {"description": "x" * 301}},
        {"name": ""},
    ],
)
def test_corrections_are_checked(user, changes):
    assert user().patch("/api/places/N/3", changes).status == 422


def test_correcting_needs_a_known_place(user):
    c = user()
    assert c.patch("/api/places/N/999", {"name": "Nope"}).status == 404
    assert c.patch("/api/places/U/999999", {"name": "Nope"}).status == 404


# ---------- places people add ----------

NEW_PLACE = {
    "name": "Pop-up Cafe",
    "category": "cafe",
    "lng": 145.0005,
    "lat": -37.8,
    "tags": {"phone": "555", "addr:street": "Some St"},
}


def test_adding_a_place(user, client):
    added = user().post("/api/places", NEW_PLACE)
    assert added.status == 201
    place = added.json()
    assert place["osmType"] == "U"
    assert place["name"] == "Pop-up Cafe"
    assert place["tags"] == {"name": "Pop-up Cafe", "phone": "555", "addr:street": "Some St"}
    # It shows up when browsing, alongside imported places
    results = browse(client()).json()["results"]
    assert {"osmType": "U", "osmId": place["osmId"]}.items() <= next(
        r for r in results if r["name"] == "Pop-up Cafe"
    ).items()


@pytest.mark.parametrize(
    "bad",
    [{"category": "Cafe!"}, {"lng": 181}, {"name": ""}, {"tags": {"amenity": "cafe"}}],
)
def test_added_places_are_checked(user, bad):
    assert user().post("/api/places", {**NEW_PLACE, **bad}).status == 422


def test_anyone_can_correct_an_added_place(user):
    owner, other = user(), user()
    place_id = owner.post("/api/places", NEW_PLACE).json()["osmId"]
    changed = other.patch(f"/api/places/U/{place_id}", {"name": "Renamed", "category": "bakery"})
    assert changed.status == 200
    assert changed.json()["name"] == "Renamed"
    assert changed.json()["category"] == "bakery"


def test_only_whoever_added_a_place_can_remove_it(user, client, db):
    owner, other = user(), user()
    place_id = owner.post("/api/places", NEW_PLACE).json()["osmId"]
    path = f"/api/places/U/{place_id}"
    other.put(f"{path}/review", {"rating": 3})

    assert other.delete(path).status == 404
    assert owner.delete(path).status == 204
    assert client().get(path).status == 404
    reviews = db.execute(
        "SELECT count(*) AS n FROM reviews WHERE place_type = 'U' AND place_id = %s", (place_id,)
    )
    assert reviews.fetchone()["n"] == 0


# ---------- reviews ----------


def test_reviews_and_rating(user, client):
    alice, bob = user(), user()
    path = "/api/places/N/5"

    mine = alice.put(f"{path}/review", {"rating": 4, "body": "  Good bread  "})
    assert mine.status == 200
    assert mine.json()["body"] == "Good bread"
    assert mine.json()["mine"] is True
    bob.put(f"{path}/review", {"rating": 2})

    community = client().get(f"{path}/community").json()
    assert community["rating"] == 3.0
    assert community["reviewCount"] == 2
    assert not any(r["mine"] for r in community["reviews"])
    seen_by_alice = alice.get(f"{path}/community").json()["reviews"]
    assert [r["mine"] for r in seen_by_alice if r["username"] == alice.username] == [True]

    # Writing again replaces your review
    alice.put(f"{path}/review", {"rating": 5})
    community = client().get(f"{path}/community").json()
    assert community["reviewCount"] == 2
    assert community["rating"] == 3.5
    assert community["reviews"][0]["username"] == alice.username  # most recently updated first

    assert alice.delete(f"{path}/review").status == 204
    community = client().get(f"{path}/community").json()
    assert community["reviewCount"] == 1
    assert community["rating"] == 2.0


def test_no_reviews_yet(client):
    community = client().get("/api/places/W/4/community").json()
    assert community == {"rating": None, "reviewCount": 0, "reviews": [], "photos": []}


@pytest.mark.parametrize(
    "review", [{"rating": 0}, {"rating": 6}, {"rating": 3, "body": "x" * 2001}]
)
def test_reviews_are_checked(user, review):
    assert user().put("/api/places/N/5/review", review).status == 422


# ---------- photos ----------


def upload(c, data: bytes, content_type="image/jpeg", place="N/3"):
    return c.request("POST", f"/api/places/{place}/photos", data=data, content_type=content_type)


def test_photos_are_re_encoded_without_location(user, client, photos_dir: Path):
    c = user()
    response = upload(c, phone_photo(2400, 1200))
    assert response.status == 201, response.body
    photo = response.json()
    # Turned upright (it was stored sideways) and shrunk to 1600 across
    assert (photo["width"], photo["height"]) == (800, 1600)
    assert photo["mine"] is True

    full = client().get(photo["url"])
    assert full.status == 200
    assert full.header("content-type") == "image/jpeg"
    assert "immutable" in full.header("cache-control")
    image = Image.open(io.BytesIO(full.body))
    assert image.size == (800, 1600)
    assert GPS_INFO not in image.getexif()
    assert not image.getexif()  # no metadata at all

    thumb = Image.open(io.BytesIO(client().get(photo["thumbUrl"]).body))
    assert max(thumb.size) == 480

    listed = client().get("/api/places/N/3/community").json()["photos"]
    assert [p["id"] for p in listed] == [photo["id"]]
    assert listed[0]["mine"] is False


def test_photos_can_be_png_or_webp(user):
    c = user()
    assert upload(c, phone_photo(300, 200, "PNG"), "image/png").status == 201
    assert upload(c, phone_photo(300, 200, "WEBP"), "image/webp").status == 201


def test_photos_must_be_images(user):
    c = user()
    assert upload(c, b"not an image at all").status == 422
    assert upload(c, phone_photo(), "text/plain").status == 415


def test_photos_have_a_size_limit(user):
    assert upload(user(), b"\0" * (20 * 1024 * 1024 + 1)).status == 413


def test_only_the_uploader_removes_a_photo(user, client, photos_dir: Path):
    owner, other = user(), user()
    photo_id = upload(owner, phone_photo(300, 200)).json()["id"]

    assert other.delete(f"/api/photos/{photo_id}").status == 404
    assert owner.delete(f"/api/photos/{photo_id}").status == 204
    assert not (photos_dir / f"{photo_id}.jpg").exists()
    assert client().get(f"/api/photos/{photo_id}").status == 404


def test_missing_photo(client):
    assert client().get("/api/photos/987654").status == 404
