"""Price helpers shared by checkout, invoicing and promotions.

All money values are Decimals rounded to the cent with ROUND_HALF_UP.
"""
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")


def to_money(value) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def apply_discount(price: Decimal, rate: Decimal) -> Decimal:
    """Price after a discount.

    `rate` is a fraction between 0 and 1: Decimal("0.15") means 15% off. Anything outside
    that range is a caller bug and raises ValueError, so a percent passed by mistake
    (15 instead of 0.15) can never silently zero out a price.
    """
    rate = Decimal(str(rate))
    if not (Decimal(0) <= rate <= Decimal(1)):
        raise ValueError(f"discount rate must be between 0 and 1, got {rate}")
    return to_money(Decimal(price) * (1 - rate))


def add_tax(amount: Decimal, tax_rate: Decimal) -> Decimal:
    return to_money(Decimal(amount) * (1 + Decimal(str(tax_rate))))
