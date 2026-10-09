"""Accounts and sessions, and the rule that writes must be JSON (or an image)."""


def test_health_reports_postgis(client):
    health = client().get("/api/health").json()
    assert health["postgres"].startswith("PostgreSQL")
    assert health["postgis"]


def test_writes_must_be_json_or_an_image(client):
    c = client()
    body = b"username=a&password=b"
    for content_type in ("application/x-www-form-urlencoded", "text/plain", "multipart/form-data"):
        response = c.request("POST", "/api/auth/login", data=body, content_type=content_type)
        assert response.status == 415, content_type
    assert c.request("POST", "/api/auth/login", data=b"{}").status == 415  # no content type
    # JSON gets through to the route (which then rejects the missing fields)
    assert c.post("/api/auth/login", {}).status == 422
    # Reads and deletes don't have bodies to check
    assert c.get("/api/me").status == 200
    assert c.delete("/api/me/recents").status == 401


def test_sign_up_starts_a_session(client):
    c = client()
    assert c.get("/api/me").json() == {"user": None}

    response = c.post("/api/auth/signup", {"username": "alice_1", "password": "correct horse"})
    assert response.status == 201
    assert response.json()["username"] == "alice_1"

    cookie = response.header("set-cookie").lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "path=/api" in cookie
    assert c.get("/api/me").json()["user"]["username"] == "alice_1"


def test_usernames_are_unique_ignoring_case(client):
    assert (
        client().post("/api/auth/signup", {"username": "Bob", "password": "12345678"}).status == 201
    )
    response = client().post("/api/auth/signup", {"username": "bob", "password": "12345678"})
    assert response.status == 409


def test_sign_up_checks_username_and_password(client):
    c = client()
    for username, password in [
        ("ab", "long enough"),  # too short
        ("has space", "long enough"),
        ("emoji😀", "long enough"),
        ("fine_name", "short"),
    ]:
        assert (
            c.post("/api/auth/signup", {"username": username, "password": password}).status == 422
        )


def test_log_in_and_out(user, client):
    someone = user(password="the password")
    c = client()
    assert (
        c.post("/api/auth/login", {"username": someone.username, "password": "nope"}).status == 401
    )
    assert c.post("/api/auth/login", {"username": "nobody-here", "password": "x"}).status == 401

    response = c.post("/api/auth/login", {"username": someone.username, "password": "the password"})
    assert response.status == 200
    assert c.get("/api/me").json()["user"]["username"] == someone.username

    old_cookies = dict(c.cookies)
    assert c.post("/api/auth/logout", {}).status == 204
    assert c.cookies == {}
    assert c.get("/api/me").json() == {"user": None}
    # The old session is gone on the server too, not just forgotten by the browser
    c.cookies = old_cookies
    assert c.get("/api/me").json() == {"user": None}


def test_repeated_failed_logins_are_blocked(user, client):
    someone = user(password="the password")
    attacker = client()
    for _ in range(10):
        wrong = {"username": someone.username, "password": "guess"}
        assert attacker.post("/api/auth/login", wrong).status == 401
    # Blocked now, even with the right password
    right = {"username": someone.username, "password": "the password"}
    assert attacker.post("/api/auth/login", right).status == 429
    # The username is blocked from other addresses too
    assert client().post("/api/auth/login", right).status == 429


def test_needs_sign_in(client):
    c = client()
    assert c.get("/api/me/places").status == 401
    assert c.get("/api/me/recents").status == 401
    assert c.delete("/api/me").status == 401
    assert (
        c.post("/api/places", {"name": "x", "category": "cafe", "lng": 0, "lat": 0}).status == 401
    )
    assert c.put("/api/places/N/1/review", {"rating": 5}).status == 401
