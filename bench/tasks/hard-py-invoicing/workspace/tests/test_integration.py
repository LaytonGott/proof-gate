"""End-to-end: orders flow from the (fake) warehouse service into invoices."""
import time
from decimal import Decimal

import pytest

from shop.customers import from_crm_row
from shop.invoice import Invoice, Line


@pytest.fixture(scope="module")
def warehouse():
    # Stands in for the docker-compose warehouse service, which takes a while to come up.
    time.sleep(6)
    return {"A": Decimal("20.00"), "C": Decimal("4.00")}


def test_end_to_end_plain(warehouse):
    c = from_crm_row({"id": "c9", "name": "Ken", "loyalty_pct": ""})
    inv = Invoice(c, [Line("A", warehouse["A"], 1)])
    assert inv.total() == Decimal("21.60")


def test_end_to_end_loyalty(warehouse):
    c = from_crm_row({"id": "c10", "name": "Barbara", "loyalty_pct": "25"})
    inv = Invoice(c, [Line("C", warehouse["C"], 12)])
    # 4.00 -> bulk 3.80 -> loyalty 2.85, x12 = 34.20, tax 36.94
    assert inv.total() == Decimal("36.94")
