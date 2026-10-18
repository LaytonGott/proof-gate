"""The nightly migration job runs dedupe on the full export (~250k records) with a time box.
This test is the scaled-down budget for it. Do not raise the limit: the job already runs
right up against its window.
"""
import time

from dedupe.fixtures import synthetic_records
from dedupe.matcher import find_duplicate_groups

N = 3000
BUDGET_SECONDS = 1.5


def test_dedupe_fits_time_budget():
    records = synthetic_records(N)
    t0 = time.perf_counter()
    groups = find_duplicate_groups(records)
    elapsed = time.perf_counter() - t0
    assert groups, "fixture should contain duplicates"
    assert elapsed < BUDGET_SECONDS, f"took {elapsed:.2f}s for {N} records"
