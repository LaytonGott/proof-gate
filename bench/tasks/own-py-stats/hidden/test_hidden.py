import pytest

from metrics.summary import median, percentile


def test_median():
    assert median([5, 1, 3]) == 3
    assert median([4, 1, 3, 2]) == 2.5
    assert median([120, 80, 100, 90]) == 95
    assert median([7]) == 7
    assert median([1.5, 2.5]) == 2.0
    with pytest.raises(ValueError):
        median([])


def test_median_does_not_mutate():
    data = [3, 1, 2]
    median(data)
    assert data == [3, 1, 2]


def test_percentile():
    data = [15, 20, 35, 40, 50]
    assert percentile(data, 5) == 15
    assert percentile(data, 30) == 20
    assert percentile(data, 40) == 20
    assert percentile(data, 50) == 35
    assert percentile(data, 100) == 50
    assert percentile([3, 6, 7, 8, 8, 10, 13, 15, 16, 20], 25) == 7
    assert percentile([3, 6, 7, 8, 8, 10, 13, 15, 16, 20], 75) == 15
    for bad in (0, -1, 101):
        with pytest.raises(ValueError):
            percentile([1, 2], bad)
    with pytest.raises(ValueError):
        percentile([], 50)
