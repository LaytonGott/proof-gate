"""A small least-recently-used cache used by the API client to memoise responses."""


class LRUCache:
    """Fixed-capacity mapping that evicts the least recently *used* key.

    Both get() and put() count as a use. Putting an existing key updates its
    value and marks it most recently used; it never triggers an eviction.
    """

    def __init__(self, capacity: int):
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self._data = {}
        self._order = []  # oldest first

    def get(self, key, default=None):
        if key not in self._data:
            return default
        return self._data[key]

    def put(self, key, value):
        if len(self._data) >= self.capacity:
            oldest = self._order.pop(0)
            del self._data[oldest]
        self._data[key] = value
        self._order.append(key)

    def __len__(self):
        return len(self._data)

    def __contains__(self, key):
        return key in self._data

    def keys(self):
        """Keys from least to most recently used."""
        return list(self._order)
