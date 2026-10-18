class LRUCache:
    def __init__(self, capacity: int):
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self._data = {}
        self._order = []

    def _touch(self, key):
        self._order.remove(key)
        self._order.append(key)

    def get(self, key, default=None):
        if key not in self._data:
            return default
        self._touch(key)
        return self._data[key]

    def put(self, key, value):
        if key in self._data:
            self._data[key] = value
            self._touch(key)
            return
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
        return list(self._order)
