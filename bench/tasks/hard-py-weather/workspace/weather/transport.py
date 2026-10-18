"""HTTP transport for the weather API. Swappable so tests can use a fake."""
import json
import urllib.request


class HttpTransport:
    def __init__(self, timeout: float = 5.0):
        self.timeout = timeout

    def get_json(self, url: str) -> dict:
        with urllib.request.urlopen(url, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
