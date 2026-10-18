from decimal import Decimal

import pytest

from shop.promotions import promo_price


def test_no_promo():
    assert promo_price(Decimal("9.99"), None, 1) == Decimal("9.99")


def test_spring15():
    assert promo_price(Decimal("9.99"), "SPRING15", 1) == Decimal("8.49")


def test_staff():
    assert promo_price(Decimal("50"), "STAFF", 2) == Decimal("35.00")


def test_bulk_discount():
    assert promo_price(Decimal("4.00"), None, 10) == Decimal("3.80")


def test_promo_and_bulk_stack():
    assert promo_price(Decimal("20.00"), "SPRING15", 12) == Decimal("16.15")


def test_unknown_code():
    with pytest.raises(KeyError):
        promo_price(Decimal("1"), "NOPE", 1)
