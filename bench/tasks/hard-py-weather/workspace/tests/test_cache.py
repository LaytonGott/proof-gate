from fakes import FakeClock

from weather.cache import TTLCache


def test_set_and_get():
    c = TTLCache(ttl=10, clock=FakeClock())
    c.set("a", 1)
    assert c.get("a") == 1
    assert c.get("missing") is None


def test_expiry():
    clock = FakeClock()
    c = TTLCache(ttl=10, clock=clock)
    c.set("a", 1)
    clock.advance(9.9)
    assert c.get("a") == 1
    clock.advance(0.2)
    assert c.get("a") is None
    assert len(c) == 0


def test_set_restarts_ttl():
    clock = FakeClock()
    c = TTLCache(ttl=10, clock=clock)
    c.set("a", 1)
    clock.advance(8)
    c.set("a", 2)
    clock.advance(8)
    assert c.get("a") == 2


def test_max_entries_evicts_oldest():
    c = TTLCache(ttl=100, max_entries=2, clock=FakeClock())
    c.set("a", 1)
    c.set("b", 2)
    c.set("c", 3)
    assert c.get("a") is None
    assert c.get("b") == 2 and c.get("c") == 3
