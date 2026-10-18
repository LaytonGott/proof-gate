class FakeClock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t

    def advance(self, s):
        self.t += s


class FakeTransport:
    def __init__(self):
        self.calls = []

    def get_json(self, url):
        self.calls.append(url)
        city = url.split("city=", 1)[1]
        return {"city": city, "temp_c": "21.5", "conditions": "sunny"}
