"""Smoke test against the real API (staging). Needs the VPN."""
from weather.client import WeatherClient


def test_live_paris():
    data = WeatherClient(cache_ttl=0).current("Paris")
    assert data["city"] == "Paris"
    assert -50 < data["temp_c"] < 60
