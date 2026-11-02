"""Numbers in query strings: points as lng,lat and boxes as west,south,east,north."""

NUMBER = r"-?\d+(\.\d+)?"
POINT = rf"^{NUMBER},{NUMBER}$"
BOX = rf"^{NUMBER}(,{NUMBER}){{3}}$"


def parse_point(text: str) -> tuple[float, float]:
    lng, lat = (float(n) for n in text.split(","))
    return lng, lat


def parse_box(text: str) -> tuple[float, float, float, float]:
    west, south, east, north = (float(n) for n in text.split(","))
    return west, south, east, north
