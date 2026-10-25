"""What the stack can plan, with GraphHopper and OpenTripPlanner down (as they are here)."""


def test_each_part_is_null_while_its_service_is_down(client):
    response = client().get("/api/capabilities")
    assert response.status == 200
    assert response.json() == {"routing": None, "transit": None}
