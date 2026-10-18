import pytest

from metrics.summary import median, percentile


def test_median_odd():
    assert median([5, 1, 3]) == 3


def test_median_even():
    assert median([4, 1, 3, 2]) == 2.5


def test_median_even_latency_sample():
    assert median([120, 80, 100, 90]) == 90


def test_median_empty():
    with pytest.raises(ValueError):
        median([])


def test_percentile_nearest_rank():
    data = [15, 20, 35, 40, 50]
    assert percentile(data, 30) == 20
    assert percentile(data, 40) == 20
    assert percentile(data, 50) == 35
    assert percentile(data, 100) == 50


def test_percentile_bad_input():
    with pytest.raises(ValueError):
        percentile([], 50)
    with pytest.raises(ValueError):
        percentile([1, 2], 0)
