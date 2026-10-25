"""Reading what GraphHopper and OpenTripPlanner can do into /api/capabilities."""

from app.capabilities import AVOIDS, routing_from_info, transit_from_data

INFO = {
    "bbox": [112, -44, 154, -10],
    "profiles": [{"name": "foot"}, {"name": "bike"}, {"name": "car"}],
    "encoded_values": {
        "road_class": ["MOTORWAY", "RESIDENTIAL"],
        "road_environment": ["ROAD", "FERRY"],
        "toll": ["NO", "ALL"],
        "crossing": ["MISSING", "TRAFFIC_SIGNALS"],
        "max_slope": [],
    },
}


def test_offers_what_the_routing_graph_supports():
    routing = routing_from_info(INFO)
    assert routing.area == [112, -44, 154, -10]
    assert routing.profiles == ["foot", "bike", "car"]
    assert [option.id for option in routing.avoid] == list(AVOIDS)
    tolls = next(option for option in routing.avoid if option.id == "tolls")
    assert tolls.priority == [{"if": "toll == ALL", "multiply_by": "0.1"}]
    assert routing.steep_hills is not None
    assert len(routing.steep_hills.priority) == 3


def test_hides_options_the_routing_graph_cant_use():
    routing = routing_from_info({"profiles": [{"name": "car"}], "encoded_values": {"toll": []}})
    assert [option.id for option in routing.avoid] == ["tolls"]
    assert routing.steep_hills is None
    assert routing.area is None


def test_rules_are_sent_as_graphhopper_spells_them():
    body = routing_from_info(INFO).model_dump(by_alias=True)
    assert body["steepHills"]["priority"][1] == {
        "else_if": "max_slope >= 8 || max_slope <= -8",
        "multiply_by": "0.2",
    }


def test_reads_timetables():
    transit = transit_from_data(
        {
            "routes": [{"mode": "TRAM"}, {"mode": "BUS"}, {"mode": "TRAM"}],
            "agencies": [{"timezone": "Pacific/Auckland"}],
            "serviceTimeRange": {"start": 1777032000, "end": 1832583600},
        }
    )
    assert transit.modes == ["BUS", "TRAM"]
    assert transit.timetables_from == "2026-04-25"
    assert transit.timetables_until == "2028-01-27"


def test_timetables_without_dates():
    transit = transit_from_data({"routes": [], "agencies": [], "serviceTimeRange": None})
    assert transit.modes == []
    assert transit.timetables_from is None
