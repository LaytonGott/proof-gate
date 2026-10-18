import math


def median(values):
    if not values:
        raise ValueError("empty")
    s = sorted(values)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def percentile(values, p):
    if not values or not (0 < p <= 100):
        raise ValueError("bad input")
    s = sorted(values)
    return s[max(1, math.ceil(p / 100 * len(s))) - 1]
