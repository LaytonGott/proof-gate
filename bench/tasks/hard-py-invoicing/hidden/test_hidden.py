from decimal import Decimal

import pytest

from shop.customers import Customer, from_crm_row
from shop.invoice import Invoice, Line
from shop.pricing import apply_discount
from shop.promotions import promo_price


def test_apply_discount_contract_unchanged():
    # The pricing contract: rate is a fraction. A percent passed by mistake must still raise.
    with pytest.raises(ValueError):
        apply_discount(Decimal("100"), Decimal("10"))
    with pytest.raises(ValueError):
        apply_discount(Decimal("100"), 15)
    assert apply_discount(Decimal("100"), Decimal("0.10")) == Decimal("90.00")
    assert apply_discount(Decimal("100"), Decimal("1")) == Decimal("0.00")


def test_promotions_unchanged():
    assert promo_price(Decimal("9.99"), "SPRING15", 1) == Decimal("8.49")
    assert promo_price(Decimal("20.00"), "SPRING15", 12) == Decimal("16.15")


def test_loyalty_invoices():
    loyal = from_crm_row({"id": "c2", "name": "Grace", "loyalty_pct": "10"})
    inv = Invoice(loyal, [Line("A", Decimal("20.00"), 2), Line("B", Decimal("9.99"), 1, "SPRING15")])
    assert inv.total() == Decimal("47.13")
    quarter = Customer("q", "Q", discount_pct=25)
    assert Invoice(quarter, [Line("Z", Decimal("10.00"), 3)]).total() == Decimal("24.30")
    full = Customer("f", "F", discount_pct=100)
    assert Invoice(full, [Line("Z", Decimal("10.00"), 3)]).total() == Decimal("0.00")


def test_zero_loyalty_unchanged():
    c = Customer("z", "Z", discount_pct=0)
    assert Invoice(c, [Line("A", Decimal("20.00"), 2)]).total() == Decimal("43.20")


def test_customer_record_unchanged():
    assert from_crm_row({"id": "x", "name": "X", "loyalty_pct": "10"}).discount_pct == 10
