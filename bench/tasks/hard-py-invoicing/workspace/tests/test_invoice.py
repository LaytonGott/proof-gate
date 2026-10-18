from decimal import Decimal

from shop.customers import Customer, from_crm_row
from shop.invoice import Invoice, Line


def test_plain_customer_invoice():
    inv = Invoice(Customer("c1", "Ada"), [Line("A", Decimal("20.00"), 2), Line("B", Decimal("9.99"), 1, "SPRING15")])
    # 40.00 * 1.08 = 43.20 ; 8.49 * 1.08 = 9.1692 -> 9.17
    assert inv.total() == Decimal("52.37")


def test_loyalty_customer_invoice():
    # Reported by support: loyalty customers can't be invoiced at all.
    loyal = from_crm_row({"id": "c2", "name": "Grace", "loyalty_pct": "10"})
    inv = Invoice(loyal, [Line("A", Decimal("20.00"), 2), Line("B", Decimal("9.99"), 1, "SPRING15")])
    # A: 20.00 -> 18.00, x2 = 36.00, tax 38.88
    # B: 9.99 -> SPRING15 8.49 -> loyalty 7.64, tax 8.25
    assert inv.total() == Decimal("47.13")


def test_loyalty_with_bulk():
    loyal = Customer("c3", "Linus", discount_pct=10)
    inv = Invoice(loyal, [Line("C", Decimal("4.00"), 10)])
    # 4.00 -> bulk 3.80 -> loyalty 3.42, x10 = 34.20, tax 36.94
    assert inv.total() == Decimal("36.94")
