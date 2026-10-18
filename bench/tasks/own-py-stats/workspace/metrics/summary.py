"""Summary statistics for the latency dashboard."""


def median(values: list[float]) -> float:
    """Median of a non-empty list.

    For an odd number of values it is the middle value after sorting; for an even
    number it is the mean of the two middle values. Raises ValueError on an empty list.
    """
    raise NotImplementedError


def percentile(values: list[float], p: float) -> float:
    """Nearest-rank percentile: the smallest value such that at least p% of the
    values are <= it. p is in (0, 100]. Raises ValueError on an empty list or bad p.
    """
    raise NotImplementedError
