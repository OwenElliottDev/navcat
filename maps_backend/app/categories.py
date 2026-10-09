"""What people can browse for, and the OSM tag values behind each category.

`osm_values` match pois.category, which db/pois.lua fills from the amenity, shop, tourism,
leisure, healthcare, office, craft or historic tag.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Category:
    id: str
    label: str
    osm_values: tuple[str, ...]
    # Other things people type for it, beyond the label
    words: tuple[str, ...] = ()


CATEGORIES = (
    Category("cafe", "Cafes", ("cafe",), ("coffee", "coffee shop", "espresso")),
    Category("restaurant", "Restaurants", ("restaurant",), ("food", "dinner", "lunch", "eat")),
    Category("fast_food", "Takeaway", ("fast_food",), ("fast food", "take away", "burgers")),
    Category(
        "bar",
        "Bars & pubs",
        ("bar", "pub", "biergarten"),
        ("pubs", "drinks", "beer", "wine bar"),
    ),
    Category(
        "supermarket",
        "Groceries",
        ("supermarket", "greengrocer"),
        ("supermarket", "grocery"),
    ),
    Category("convenience", "Convenience stores", ("convenience",), ("milk bar",)),
    Category("bakery", "Bakeries", ("bakery",), ("bread",)),
    Category("pharmacy", "Pharmacies", ("pharmacy", "chemist"), ("chemist",)),
    Category("doctor", "Doctors", ("doctors", "clinic"), ("gp", "medical centre", "clinic")),
    Category("hospital", "Hospitals", ("hospital",), ("emergency",)),
    Category("dentist", "Dentists", ("dentist",)),
    Category("fuel", "Petrol", ("fuel",), ("fuel", "gas station", "servo")),
    Category(
        "ev_charging",
        "EV charging",
        ("charging_station",),
        ("charger", "charging station"),
    ),
    Category("atm", "ATMs", ("atm",), ("cash",)),
    Category("bank", "Banks", ("bank",)),
    Category("post_office", "Post offices", ("post_office",), ("post", "australia post")),
    Category("toilets", "Toilets", ("toilets",), ("bathroom", "restroom", "loo")),
    Category("park", "Parks", ("park",), ("garden", "reserve")),
    Category("playground", "Playgrounds", ("playground",)),
    Category("gym", "Gyms", ("fitness_centre",), ("fitness",)),
    Category("library", "Libraries", ("library",)),
    Category(
        "hotel",
        "Hotels",
        ("hotel", "motel", "guest_house", "hostel"),
        ("accommodation", "motel", "hostel"),
    ),
    Category("museum", "Museums", ("museum", "gallery"), ("art gallery",)),
    Category("cinema", "Cinemas", ("cinema",), ("movies",)),
    Category("hardware", "Hardware", ("hardware", "doityourself"), ("diy",)),
    Category("bicycle", "Bike shops", ("bicycle",), ("bike shop", "bike repair")),
)

CATEGORIES_BY_ID = {category.id: category for category in CATEGORIES}
