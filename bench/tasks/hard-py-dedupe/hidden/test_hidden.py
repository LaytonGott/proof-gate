import time

from dedupe.fixtures import synthetic_records
from dedupe.matcher import Record, find_duplicate_groups, is_duplicate


def _naive_groups(records):
    parent = {r.id: r.id for r in records}

    def find(x):
        while parent[x] != x:
            x = parent[x]
        return x

    for i, a in enumerate(records):
        for b in records[i + 1:]:
            if is_duplicate(a, b):
                parent[find(a.id)] = find(b.id)
    groups = {}
    for r in records:
        groups.setdefault(find(r.id), []).append(r.id)
    return sorted((sorted(g) for g in groups.values() if len(g) > 1), key=lambda g: g[0])


def test_same_groups_as_pairwise_definition():
    for seed in (1, 2, 3):
        records = synthetic_records(400, seed=seed)
        assert find_duplicate_groups(records) == _naive_groups(records)


def test_name_plus_postcode_and_transitivity():
    rs = [
        Record("c", "Wei Chen", "wei@x.org", "1"),
        Record("a", "Wei Chen", "w.chen@gmail.com", "1"),
        Record("b", "W Chen", "wchen@gmail.com", "9"),
        Record("d", "chen, wei", "other@x.org", "1"),
        Record("e", "Wei Chen", "e@x.org", "2"),
    ]
    assert find_duplicate_groups(rs) == [["a", "b", "c", "d"]]


def test_large_input_is_fast():
    records = synthetic_records(20000, seed=11)
    t0 = time.perf_counter()
    groups = find_duplicate_groups(records)
    assert time.perf_counter() - t0 < 3.0
    assert groups
