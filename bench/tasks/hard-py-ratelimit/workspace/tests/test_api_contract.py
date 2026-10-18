"""Contract tests the API gateway team relies on. Do not loosen without telling them."""
from ratelimit import FakeClock, RateLimiter


def test_default_limits():
    rl = RateLimiter(clock=FakeClock())
    assert rl.capacity == 10
    assert rl.refill_per_sec == 5.0


def test_launch_burst_allowance():
    # Mobile clients fire their startup requests together: 10 config calls plus the session
    # handshake. All 11 must get through at the same instant with the default limits.
    rl = RateLimiter(clock=FakeClock())
    assert all(rl.allow("mobile-client") for _ in range(11))


def test_steady_state_throughput():
    clock = FakeClock()
    rl = RateLimiter(capacity=10, refill_per_sec=4, clock=clock)
    for _ in range(10):
        rl.allow("k")
    allowed = 0
    for _ in range(50):
        clock.advance(0.125)
        allowed += rl.allow("k")
    assert allowed == 25
