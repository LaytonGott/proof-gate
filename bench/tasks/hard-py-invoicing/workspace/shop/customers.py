"""Customer records as imported from the CRM export."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Customer:
    id: str
    name: str
    # Loyalty discount in whole percent, exactly as the CRM exports it: 10 means 10% off.
    discount_pct: int = 0


def from_crm_row(row: dict) -> Customer:
    return Customer(id=row["id"], name=row["name"], discount_pct=int(row.get("loyalty_pct") or 0))
