from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    """Request and response bodies. JSON uses camelCase to match the frontend."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class User(ApiModel):
    id: int
    username: str


class PlaceSnapshot(ApiModel):
    """A place as the user saw it: enough to show it again without looking it up."""

    name: str = Field(min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=300)
    lng: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    osm_type: Literal["N", "W", "R", "U", "O"] | None = None
    """OSM node, way or relation, U for a place someone added, or O for one from Overture."""
    osm_id: int | None = None
