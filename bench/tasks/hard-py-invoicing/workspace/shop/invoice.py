"""Invoices built from customer orders."""
from dataclasses import dataclass, field
from decimal import Decimal

from .customers import Customer
from .pricing import add_tax, apply_discount, to_money
from .promotions import promo_price

TAX_RATE = Decimal("0.08")


@dataclass
class Line:
    sku: str
    unit_price: Decimal
    qty: int
    promo: str | None = None


@dataclass
class Invoice:
    customer: Customer
    lines: list[Line] = field(default_factory=list)

    def line_total(self, line: Line) -> Decimal:
        """Promotion first, then the customer's loyalty discount on the unit price,
        then quantity, then tax. Each line is rounded to the cent."""
        unit = promo_price(line.unit_price, line.promo, line.qty)
        unit = apply_discount(unit, self.customer.discount_pct)
        return add_tax(unit * line.qty, TAX_RATE)

    def total(self) -> Decimal:
        return to_money(sum((self.line_total(line) for line in self.lines), Decimal("0")))
