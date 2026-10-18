from fakes import FakeClock, FakeTransport

from weather.cache import TTLCache
from weather.client import DEFAULT_BASE_URL, WeatherClient


def test_cache_semantics():
    clock = FakeClock()
    c = TTLCache(ttl=5, max_entries=3, clock=clock)
    for k in "abc":
        c.set(k, k.upper())
    c.set("a", "A2")  # replacing restarts TTL but does not evict
    assert len(c) == 3 and c.get("b") == "B"
    c.set("d", "D")  # evicts the entry set longest ago: b
    assert c.get("b") is None and c.get("a") == "A2" and c.get("d") == "D"
    clock.advance(5.5)
    assert c.get("a") is None and len(c) == 0


def test_client_caches_per_city_case_insensitive():
    t, clock = FakeTransport(), FakeClock()
    c = WeatherClient(transport=t, cache_ttl=30, clock=clock)
    c.current("Paris")
    c.current("PARIS")
    c.current("Oslo")
    assert len(t.calls) == 2
    clock.advance(31)
    c.current("paris")
    assert len(t.calls) == 3


def test_client_still_calls_the_real_url():
    t = FakeTransport()
    WeatherClient(transport=t, cache_ttl=0).current("New York")
    assert t.calls == [f"{DEFAULT_BASE_URL}/current?city=New%20York"]


def test_disabled_cache():
    t = FakeTransport()
    c = WeatherClient(transport=t, cache_ttl=0, clock=FakeClock())
    for _ in range(3):
        c.current("Rome")
    assert len(t.calls) == 3


def test_default_client_uses_http_transport():
    from weather.transport import HttpTransport

    assert isinstance(WeatherClient().transport, HttpTransport)
