"""Per-key rate limiting for the public API."""
from .bucket import TokenBucket
from .clock import MonotonicClock


class RateLimiter:
    """One token bucket per API key. Every key gets the same capacity and refill rate."""

    def __init__(self, capacity: int = 10, refill_per_sec: float = 5.0, clock=None):
        self.capacity = capacity
        self.refill_per_sec = refill_per_sec
        self.clock = clock or MonotonicClock()
        self._buckets: dict[str, TokenBucket] = {}

    def _bucket(self, key: str) -> TokenBucket:
        if key not in self._buckets:
            self._buckets[key] = TokenBucket(self.capacity, self.refill_per_sec, self.clock)
        return self._buckets[key]

    def allow(self, key: str, cost: int = 1) -> bool:
        return self._bucket(key).consume(cost)

    def remaining(self, key: str) -> int:
        return int(self._bucket(key).available())
