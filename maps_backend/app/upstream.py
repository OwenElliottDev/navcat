"""Requests to this stack's other services (GraphHopper, OpenTripPlanner, Photon, TileServer)."""

import io
import json

import pycurl


class Unavailable(Exception):
    """The service isn't answering, e.g. still starting or importing."""


class Rejected(Unavailable):
    """The service turned the request down (a 4xx); the message is its answer."""


def _perform(url: str, timeout: float, setup=None) -> bytes:
    buffer = io.BytesIO()
    curl = pycurl.Curl()
    try:
        curl.setopt(pycurl.URL, url)
        curl.setopt(pycurl.WRITEDATA, buffer)
        curl.setopt(pycurl.TIMEOUT_MS, int(timeout * 1000))
        # No SIGALRM for timeouts, which can land on another thread
        curl.setopt(pycurl.NOSIGNAL, 1)
        if setup:
            setup(curl)
        curl.perform()
        status = curl.getinfo(pycurl.RESPONSE_CODE)
    except pycurl.error as err:
        raise Unavailable(str(err)) from err
    finally:
        curl.close()
    if 400 <= status < 500:
        raise Rejected(buffer.getvalue().decode(errors="replace"))
    if status != 200:
        raise Unavailable(f"{url} answered {status}")
    return buffer.getvalue()


def get(url: str, timeout: float) -> bytes:
    """The body of a GET that has to succeed (blocking: run it in a thread)."""
    return _perform(url, timeout)


def post_json(url: str, body: dict, timeout: float) -> bytes:
    """The body of a JSON POST that has to succeed (blocking: run it in a thread)."""

    def setup(curl: pycurl.Curl) -> None:
        curl.setopt(pycurl.POSTFIELDS, json.dumps(body))
        curl.setopt(pycurl.HTTPHEADER, ["Content-Type: application/json"])

    return _perform(url, timeout, setup)
