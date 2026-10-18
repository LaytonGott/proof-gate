import pytest

from ratelimit import FakeClock, TokenBucket


def test_starts_full():
    b = TokenBucket(10, 1, FakeClock())
    assert b.available() == 10


def test_burst_is_capped_at_capacity():
    b = TokenBucket(10, 1, FakeClock())
    assert all(b.consume() for _ in range(10))
    assert b.consume() is False


def test_whole_second_refill():
    clock = FakeClock()
    b = TokenBucket(5, 2, clock)
    for _ in range(5):
        b.consume()
    clock.advance(1)
    assert b.available() == 2


def test_fractional_refill():
    clock = FakeClock()
    b = TokenBucket(5, 4, clock)
    for _ in range(5):
        b.consume()
    clock.advance(0.5)
    assert b.available() == 2


def test_many_small_steps_add_up():
    clock = FakeClock()
    b = TokenBucket(10, 10, clock)
    for _ in range(10):
        b.consume()
    for _ in range(10):
        clock.advance(0.05)
        b.available()
    assert b.available() == pytest.approx(5)


def test_never_exceeds_capacity():
    clock = FakeClock()
    b = TokenBucket(3, 100, clock)
    clock.advance(60)
    assert b.available() == 3


def test_failed_consume_takes_nothing():
    b = TokenBucket(2, 1, FakeClock())
    assert b.consume(3) is False
    assert b.available() == 2


def test_rejects_bad_config():
    with pytest.raises(ValueError):
        TokenBucket(0, 1, FakeClock())
