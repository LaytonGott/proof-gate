from decimal import Decimal

from shop.customers import Customer
from shop.invoice import Invoice, Line
from shop.reports import monthly_revenue, revenue_by_customer


def _invoices():
    a, b = Customer("a", "A"), Customer("b", "B")
    return [
        Invoice(a, [Line("X", Decimal("10.00"), 1)]),
        Invoice(b, [Line("Y", Decimal("5.00"), 3, "STAFF")]),
        Invoice(a, [Line("Z", Decimal("2.50"), 4)]),
    ]


def test_revenue_by_customer():
    assert revenue_by_customer(_invoices()) == {"a": Decimal("21.60"), "b": Decimal("11.34")}


def test_monthly_revenue():
    assert monthly_revenue(_invoices()) == Decimal("32.94")
