from ratelimit import FakeClock, RateLimiter


def test_keys_are_independent():
    rl = RateLimiter(capacity=2, refill_per_sec=1, clock=FakeClock())
    assert rl.allow("a") and rl.allow("a")
    assert not rl.allow("a")
    assert rl.allow("b")


def test_cost():
    rl = RateLimiter(capacity=5, refill_per_sec=1, clock=FakeClock())
    assert rl.allow("k", cost=5)
    assert not rl.allow("k")


def test_recovers_after_refill():
    clock = FakeClock()
    rl = RateLimiter(capacity=4, refill_per_sec=8, clock=clock)
    for _ in range(4):
        rl.allow("k")
    assert not rl.allow("k")
    clock.advance(0.25)
    assert rl.remaining("k") == 2
    assert rl.allow("k")
