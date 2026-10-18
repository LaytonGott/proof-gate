import pytest

from ratelimit import FakeClock, RateLimiter, TokenBucket


def test_burst_never_exceeds_capacity():
    for cap in (1, 3, 10):
        rl = RateLimiter(capacity=cap, refill_per_sec=5, clock=FakeClock())
        assert sum(rl.allow("k") for _ in range(cap + 5)) == cap
    rl = RateLimiter(clock=FakeClock())
    assert sum(rl.allow("mobile-client") for _ in range(11)) == 10


def test_fractional_refills():
    clock = FakeClock()
    b = TokenBucket(10, 3, clock)
    for _ in range(10):
        b.consume()
    clock.advance(0.5)
    assert b.available() == pytest.approx(1.5)
    clock.advance(0.1)
    assert b.available() == pytest.approx(1.8)
    assert b.consume() and not b.consume()


def test_cap_after_long_idle():
    clock = FakeClock()
    b = TokenBucket(4, 2, clock)
    b.consume(4)
    clock.advance(1000)
    assert b.available() == 4


def test_steady_state():
    clock = FakeClock()
    rl = RateLimiter(capacity=10, refill_per_sec=4, clock=clock)
    for _ in range(10):
        rl.allow("k")
    allowed = 0
    for _ in range(100):
        clock.advance(0.0625)
        allowed += rl.allow("k")
    assert allowed == 25


def test_defaults_unchanged():
    rl = RateLimiter(clock=FakeClock())
    assert (rl.capacity, rl.refill_per_sec) == (10, 5.0)
