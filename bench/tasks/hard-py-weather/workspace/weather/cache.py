"""In-memory TTL cache for API responses."""
import time


class TTLCache:
    """Maps keys to values that expire `ttl` seconds after they were set.

    - get(key) returns the value, or None if the key is missing or expired. Expired
      entries are removed when they are looked up.
    - set(key, value) stores or replaces the value and restarts its TTL.
    - At most `max_entries` live entries are kept; when a new key would exceed that, the
      entry that was set longest ago is evicted.
    - `clock` is a zero-argument callable returning seconds; defaults to time.monotonic.
    """

    def __init__(self, ttl: float, max_entries: int = 1000, clock=time.monotonic):
        raise NotImplementedError("TODO(caching): implement TTLCache")

    def get(self, key):
        raise NotImplementedError

    def set(self, key, value) -> None:
        raise NotImplementedError

    def __len__(self) -> int:
        raise NotImplementedError
