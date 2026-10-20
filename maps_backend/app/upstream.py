"""Requests to this stack's other services (GraphHopper, Photon, TileServer)."""

import io

import pycurl


class Unavailable(Exception):
    """The service isn't answering, e.g. still starting or importing."""


def get(url: str, timeout: float) -> bytes:
    """The body of a GET that has to succeed (blocking: run it in a thread)."""
    buffer = io.BytesIO()
    curl = pycurl.Curl()
    try:
        curl.setopt(pycurl.URL, url)
        curl.setopt(pycurl.WRITEDATA, buffer)
        curl.setopt(pycurl.TIMEOUT_MS, int(timeout * 1000))
        curl.perform()
        status = curl.getinfo(pycurl.RESPONSE_CODE)
    except pycurl.error as err:
        raise Unavailable(str(err)) from err
    finally:
        curl.close()
    if status != 200:
        raise Unavailable(f"{url} answered {status}")
    return buffer.getvalue()
