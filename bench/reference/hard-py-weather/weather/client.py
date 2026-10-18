import time
from urllib.parse import quote

from .cache import TTLCache
from .transport import HttpTransport

DEFAULT_BASE_URL = "http://weather-api.internal.example/v1"


class WeatherClient:
    def __init__(self, base_url: str = DEFAULT_BASE_URL, transport=None, cache_ttl: float = 300, clock=None):
        self.base_url = base_url.rstrip("/")
        self.transport = transport or HttpTransport()
        self.cache_ttl = cache_ttl
        self._cache = TTLCache(cache_ttl, clock=clock or time.monotonic) if cache_ttl > 0 else None

    def current(self, city: str) -> dict:
        key = city.lower()
        if self._cache is not None:
            hit = self._cache.get(key)
            if hit is not None:
                return hit
        data = self.transport.get_json(f"{self.base_url}/current?city={quote(city)}")
        out = {"city": data["city"], "temp_c": float(data["temp_c"]), "conditions": data["conditions"]}
        if self._cache is not None:
            self._cache.set(key, out)
        return out
