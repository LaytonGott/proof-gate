"""Promo codes and bulk discounts."""
from decimal import Decimal

from .pricing import apply_discount, to_money

PROMOS = {
    "SPRING15": Decimal("0.15"),
    "STAFF": Decimal("0.30"),
}
BULK_RATE = Decimal("0.05")
BULK_MIN_QTY = 10


def promo_price(unit_price: Decimal, code: str | None, qty: int) -> Decimal:
    """Unit price after the promo code (if any) and the bulk discount (10+ units)."""
    price = to_money(unit_price)
    if code:
        if code not in PROMOS:
            raise KeyError(f"unknown promo code {code!r}")
        price = apply_discount(price, PROMOS[code])
    if qty >= BULK_MIN_QTY:
        price = apply_discount(price, BULK_RATE)
    return price
