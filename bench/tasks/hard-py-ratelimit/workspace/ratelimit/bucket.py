"""Token bucket.

A bucket holds at most `capacity` tokens and starts full. Tokens refill continuously at
`refill_per_sec` (fractional refills accumulate: after 0.5 s at 4 tokens/s there are 2 more
tokens). `consume(n)` takes n tokens if that many are available and returns True; otherwise
it takes nothing and returns False. The bucket never holds more than `capacity`, so a burst
can never exceed `capacity` requests.
"""


class TokenBucket:
    def __init__(self, capacity: int, refill_per_sec: float, clock):
        if capacity <= 0 or refill_per_sec <= 0:
            raise ValueError("capacity and refill rate must be positive")
        self.capacity = capacity
        self.refill_per_sec = refill_per_sec
        self.clock = clock
        self._tokens = float(capacity)
        self._last = clock.now()

    def _refill(self) -> None:
        now = self.clock.now()
        elapsed = now - self._last
        self._tokens = min(self.capacity, self._tokens + int(elapsed) * self.refill_per_sec)
        self._last = now

    def available(self) -> float:
        self._refill()
        return self._tokens

    def consume(self, n: int = 1) -> bool:
        self._refill()
        if self._tokens >= n:
            self._tokens -= n
            return True
        return False
