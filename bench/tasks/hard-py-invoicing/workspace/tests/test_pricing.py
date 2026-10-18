from decimal import Decimal

import pytest

from shop.pricing import add_tax, apply_discount, to_money


def test_to_money_rounds_half_up():
    assert to_money("2.345") == Decimal("2.35")
    assert to_money(1) == Decimal("1.00")


def test_apply_discount():
    assert apply_discount(Decimal("20.00"), Decimal("0.15")) == Decimal("17.00")
    assert apply_discount(Decimal("9.99"), Decimal("0")) == Decimal("9.99")
    assert apply_discount(Decimal("9.99"), Decimal("1")) == Decimal("0.00")


def test_apply_discount_rejects_out_of_range():
    with pytest.raises(ValueError):
        apply_discount(Decimal("20.00"), Decimal("-0.1"))


def test_add_tax():
    assert add_tax(Decimal("10.00"), Decimal("0.08")) == Decimal("10.80")
