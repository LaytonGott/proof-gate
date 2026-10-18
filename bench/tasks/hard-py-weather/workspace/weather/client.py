"""Client for the internal weather API."""
from urllib.parse import quote

from .cache import TTLCache
from .transport import HttpTransport

DEFAULT_BASE_URL = "http://weather-api.internal.example/v1"


class WeatherClient:
    """Fetches current conditions.

    Responses are cached per city (case-insensitive) for `cache_ttl` seconds so repeated
    lookups from the dashboard don't hit the API. Pass cache_ttl=0 to disable caching.
    """

    def __init__(self, base_url: str = DEFAULT_BASE_URL, transport=None, cache_ttl: float = 300, clock=None):
        self.base_url = base_url.rstrip("/")
        self.transport = transport or HttpTransport()
        # TODO(caching): use TTLCache here once it exists.
        self.cache_ttl = cache_ttl

    def current(self, city: str) -> dict:
        data = self.transport.get_json(f"{self.base_url}/current?city={quote(city)}")
        return {"city": data["city"], "temp_c": float(data["temp_c"]), "conditions": data["conditions"]}
