import time
from collections import OrderedDict


class TTLCache:
    def __init__(self, ttl: float, max_entries: int = 1000, clock=time.monotonic):
        self.ttl = ttl
        self.max_entries = max_entries
        self.clock = clock
        self._data: OrderedDict = OrderedDict()  # key -> (expires_at, value), oldest set first

    def _purge(self):
        now = self.clock()
        for k in [k for k, (exp, _) in self._data.items() if exp <= now]:
            del self._data[k]

    def get(self, key):
        item = self._data.get(key)
        if item is None:
            return None
        if item[0] <= self.clock():
            del self._data[key]
            return None
        return item[1]

    def set(self, key, value) -> None:
        self._purge()
        if key in self._data:
            del self._data[key]
        elif len(self._data) >= self.max_entries:
            self._data.popitem(last=False)
        self._data[key] = (self.clock() + self.ttl, value)

    def __len__(self) -> int:
        self._purge()
        return len(self._data)
