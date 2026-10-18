"""Monthly revenue reports."""
from collections import defaultdict
from decimal import Decimal

from .invoice import Invoice
from .pricing import to_money


def revenue_by_customer(invoices: list[Invoice]) -> dict[str, Decimal]:
    out: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for inv in invoices:
        out[inv.customer.id] += inv.total()
    return {k: to_money(v) for k, v in out.items()}


def monthly_revenue(invoices: list[Invoice]) -> Decimal:
    return to_money(sum((inv.total() for inv in invoices), Decimal("0")))
