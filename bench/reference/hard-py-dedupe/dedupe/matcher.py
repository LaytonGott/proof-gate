from dataclasses import dataclass

from .normalize import normalize_email, normalize_name


@dataclass(frozen=True)
class Record:
    id: str
    name: str
    email: str
    postcode: str


def is_duplicate(a: Record, b: Record) -> bool:
    if normalize_email(a.email) == normalize_email(b.email):
        return True
    return a.postcode == b.postcode and normalize_name(a.name) == normalize_name(b.name)


def find_duplicate_groups(records: list[Record]) -> list[list[str]]:
    parent = {r.id: r.id for r in records}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        parent[find(a)] = find(b)

    first_by_key: dict[tuple, str] = {}
    for r in records:
        for key in (("e", normalize_email(r.email)), ("n", r.postcode, normalize_name(r.name))):
            if key in first_by_key:
                union(r.id, first_by_key[key])
            else:
                first_by_key[key] = r.id

    groups: dict[str, list[str]] = {}
    for r in records:
        groups.setdefault(find(r.id), []).append(r.id)
    return sorted((sorted(g) for g in groups.values() if len(g) > 1), key=lambda g: g[0])
