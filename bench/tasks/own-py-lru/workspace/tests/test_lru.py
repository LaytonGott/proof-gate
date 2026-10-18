import pytest

from cachelib.lru import LRUCache


def test_basic_put_get():
    c = LRUCache(2)
    c.put("a", 1)
    assert c.get("a") == 1
    assert c.get("missing", "x") == "x"


def test_evicts_least_recently_used():
    c = LRUCache(2)
    c.put("a", 1)
    c.put("b", 2)
    c.get("a")
    c.put("c", 3)
    assert "b" not in c
    assert c.get("a") == 1


def test_overwrite_does_not_evict():
    c = LRUCache(2)
    c.put("a", 1)
    c.put("b", 2)
    c.put("a", 10)
    assert len(c) == 2
    assert c.get("b") == 2
    assert c.get("a") == 10


def test_bad_capacity():
    with pytest.raises(ValueError):
        LRUCache(0)
