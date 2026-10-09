"""What the API accepts, checked before anything reaches the database."""

import re

import pytest
from pydantic import ValidationError

from app.categories import CATEGORIES
from app.migrations import MIGRATIONS_DIR
from app.places import clean_tags, details_from_row
from app.routes.auth import SignUp
from app.routes.places import NewPlace, PlaceChanges


def test_editable_tags_are_trimmed():
    changes = PlaceChanges(tags={"phone": "  03 9000 0000 ", "opening_hours": ""})
    assert changes.tags == {"phone": "03 9000 0000", "opening_hours": ""}


@pytest.mark.parametrize(
    "tags",
    [
        {"amenity": "bar"},
        {"name": "Sneaky"},  # names are changed through `name`, not tags
        {"website": "www.example.com"},
        {"website": "javascript:alert(1)"},
        {"cuisine": "x" * 301},
    ],
)
def test_tag_changes_are_checked(tags):
    with pytest.raises(ValidationError):
        PlaceChanges(tags=tags)
    with pytest.raises(ValidationError):
        NewPlace(name="x", category="cafe", lng=0, lat=0, tags=tags)


def test_websites_need_a_scheme():
    assert PlaceChanges(tags={"website": "https://example.com"}).tags["website"]
    assert PlaceChanges(tags={"website": "http://example.com"}).tags["website"]


@pytest.mark.parametrize("category", ["Cafe", "c", "fast-food", "x" * 41])
def test_categories_look_like_osm_values(category):
    with pytest.raises(ValidationError):
        NewPlace(name="x", category=category, lng=0, lat=0)
    assert NewPlace(name="x", category="fast_food", lng=0, lat=0).category == "fast_food"


def test_new_places_need_a_real_position():
    for lng, lat in [(181, 0), (0, -91)]:
        with pytest.raises(ValidationError):
            NewPlace(name="x", category="cafe", lng=lng, lat=lat)


def test_removed_tags_are_dropped_and_the_name_comes_from_tags():
    row = {"osm_type": "N", "osm_id": 1, "tags": {"name": "Cafe", "phone": "", "level": 2}}
    assert clean_tags(row["tags"]) == {"name": "Cafe", "level": "2"}
    assert details_from_row(row) == {
        "osm_type": "N",
        "osm_id": 1,
        "tags": {"name": "Cafe", "level": "2"},
        "name": "Cafe",
    }
    assert details_from_row({"tags": {}})["name"] is None


@pytest.mark.parametrize("username", ["ab", "has space", "semi;colon", "ünïcode", "x" * 41])
def test_usernames_are_plain(username):
    with pytest.raises(ValidationError):
        SignUp(username=username, password="long enough")
    assert SignUp(username="Some.User_1-2", password="long enough")


def test_migrations_are_numbered_once_each():
    names = [path.name for path in sorted(MIGRATIONS_DIR.glob("*.sql"))]
    assert names, "no migrations found"
    assert all(re.fullmatch(r"\d{3}_[a-z0-9_]+\.sql", name) for name in names), names
    numbers = [name[:3] for name in names]
    assert len(numbers) == len(set(numbers)), "two migrations share a number"
    assert numbers == [f"{n:03}" for n in range(1, len(numbers) + 1)], "gap in the numbering"


def test_each_osm_value_belongs_to_one_category():
    # A place shows under one browse category; the first value is what new places get
    values = [value for category in CATEGORIES for value in category.osm_values]
    assert len(values) == len(set(values))
