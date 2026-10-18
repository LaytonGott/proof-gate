from cachelib.lru import LRUCache


def test_get_refreshes_order():
    c = LRUCache(3)
    for k in "abc":
        c.put(k, k)
    c.get("a")
    assert c.keys() == ["b", "c", "a"]


def test_put_existing_refreshes_and_keeps_size():
    c = LRUCache(2)
    c.put("a", 1)
    c.put("b", 2)
    c.put("a", 3)
    c.put("c", 4)
    assert "b" not in c
    assert c.get("a") == 3 and c.get("c") == 4
    assert len(c) == 2


def test_capacity_one():
    c = LRUCache(1)
    c.put("a", 1)
    c.put("a", 2)
    assert c.get("a") == 2
    c.put("b", 3)
    assert "a" not in c and c.get("b") == 3
    assert c.keys() == ["b"]


def test_get_missing_does_not_change_order():
    c = LRUCache(2)
    c.put("a", 1)
    c.put("b", 2)
    c.get("zzz")
    c.put("c", 3)
    assert c.keys() == ["b", "c"]


def test_falsy_values_are_cached():
    c = LRUCache(2)
    c.put("z", 0)
    c.put("n", None)
    assert c.get("z", "d") == 0
    assert "n" in c


def test_long_sequence_matches_reference():
    import collections

    c, ref = LRUCache(4), collections.OrderedDict()
    ops = [(i * 7919) % 11 for i in range(300)]
    for i, k in enumerate(ops):
        if i % 3 == 0:
            got = c.get(k)
            want = ref.get(k)
            if k in ref:
                ref.move_to_end(k)
            assert got == want
        else:
            c.put(k, i)
            ref[k] = i
            ref.move_to_end(k)
            if len(ref) > 4:
                ref.popitem(last=False)
        assert c.keys() == list(ref.keys())
