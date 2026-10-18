"""Deterministic synthetic customer data, shaped like the real CRM export."""
import random

from .matcher import Record

_FIRST = ["José", "Ana", "Wei", "Fatima", "John", "Maria", "Liam", "Aisha", "Kenji", "Olga", "Pierre", "Sara"]
_LAST = ["García-Lopez", "Smith", "Chen", "Khan", "Müller", "Rossi", "Okafor", "Ivanova", "Dubois", "Tanaka"]
_DOMAINS = ["gmail.com", "example.org", "mail.test", "corp.example"]


def synthetic_records(n: int, seed: int = 7) -> list[Record]:
    rng = random.Random(seed)
    out = []
    for i in range(n):
        first, last = rng.choice(_FIRST), rng.choice(_LAST)
        domain = rng.choice(_DOMAINS)
        email = f"{first.lower()}.{last.lower()}{rng.randrange(100000)}@{domain}"
        postcode = f"{rng.randrange(10000):04d}"
        name = f"{first} {last}"
        if i and rng.random() < 0.05:
            # A re-entered duplicate of an earlier record: noisy name, same email.
            prev = out[rng.randrange(len(out))]
            name = f"Dr. {prev.name.upper()}"
            email = prev.email.upper()
            postcode = prev.postcode
        out.append(Record(f"r{i:05d}", name, email, postcode))
    return out
