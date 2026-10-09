"""A small HTTP client for tests, on pycurl. Each Client keeps its own cookies, so two clients
are two people."""

import io
import json
from dataclasses import dataclass, field
from urllib.parse import urlencode

import pycurl


@dataclass
class Response:
    status: int
    headers: dict[str, list[str]]
    body: bytes

    def json(self):
        return json.loads(self.body)

    def header(self, name: str) -> str | None:
        values = self.headers.get(name.lower())
        return values[-1] if values else None


@dataclass
class Client:
    base_url: str
    headers: dict[str, str] = field(default_factory=dict)
    """Sent with every request, e.g. x-real-ip to look like a different address."""
    cookies: dict[str, str] = field(default_factory=dict)

    def request(
        self,
        method: str,
        path: str,
        *,
        json_body=None,
        data: bytes | None = None,
        content_type: str | None = None,
        params: dict | None = None,
        headers: dict[str, str] | None = None,
    ) -> Response:
        url = self.base_url + path
        if params:
            url += "?" + urlencode(params, doseq=True)

        sent = {**self.headers, **(headers or {})}
        if json_body is not None:
            data = json.dumps(json_body).encode()
            content_type = "application/json"
        if content_type:
            sent["Content-Type"] = content_type
        if self.cookies:
            sent["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())

        body = io.BytesIO()
        received: dict[str, list[str]] = {}

        def on_header(line: bytes) -> None:
            text = line.decode("iso-8859-1").strip()
            if ":" in text:
                name, value = text.split(":", 1)
                received.setdefault(name.strip().lower(), []).append(value.strip())

        curl = pycurl.Curl()
        try:
            curl.setopt(pycurl.URL, url)
            curl.setopt(pycurl.CUSTOMREQUEST, method)
            curl.setopt(pycurl.WRITEDATA, body)
            curl.setopt(pycurl.HEADERFUNCTION, on_header)
            curl.setopt(pycurl.TIMEOUT, 30)
            # Stop curl adding "Expect: 100-continue" to bigger uploads
            curl.setopt(pycurl.HTTPHEADER, [f"{k}: {v}" for k, v in sent.items()] + ["Expect:"])
            if data is not None:
                curl.setopt(pycurl.POSTFIELDS, data)
            elif method == "HEAD":
                curl.setopt(pycurl.NOBODY, True)
            curl.perform()
            status = curl.getinfo(pycurl.RESPONSE_CODE)
        finally:
            curl.close()

        for cookie in received.get("set-cookie", []):
            name, _, rest = cookie.partition("=")
            value = rest.split(";", 1)[0].strip('"')
            # A deleted cookie comes back empty (and already expired)
            if value and "max-age=0" not in cookie.lower():
                self.cookies[name] = value
            else:
                self.cookies.pop(name, None)

        return Response(status, received, body.getvalue())

    def get(self, path: str, **kwargs) -> Response:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, body=None, **kwargs) -> Response:
        return self.request("POST", path, json_body=body, **kwargs)

    def put(self, path: str, body=None, **kwargs) -> Response:
        return self.request("PUT", path, json_body=body, **kwargs)

    def patch(self, path: str, body=None, **kwargs) -> Response:
        return self.request("PATCH", path, json_body=body, **kwargs)

    def delete(self, path: str, **kwargs) -> Response:
        return self.request("DELETE", path, **kwargs)
