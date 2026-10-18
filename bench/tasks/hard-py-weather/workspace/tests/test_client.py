from fakes import FakeClock, FakeTransport

from weather.client import WeatherClient


def test_parses_response():
    c = WeatherClient(transport=FakeTransport())
    assert c.current("Paris") == {"city": "Paris", "temp_c": 21.5, "conditions": "sunny"}


def test_repeated_lookups_are_cached():
    t = FakeTransport()
    c = WeatherClient(transport=t, clock=FakeClock())
    c.current("Paris")
    c.current("paris")
    c.current("PARIS")
    assert len(t.calls) == 1


def test_cache_expires():
    t, clock = FakeTransport(), FakeClock()
    c = WeatherClient(transport=t, cache_ttl=60, clock=clock)
    c.current("Oslo")
    clock.advance(61)
    c.current("Oslo")
    assert len(t.calls) == 2


def test_cache_can_be_disabled():
    t = FakeTransport()
    c = WeatherClient(transport=t, cache_ttl=0, clock=FakeClock())
    c.current("Rome")
    c.current("Rome")
    assert len(t.calls) == 2
