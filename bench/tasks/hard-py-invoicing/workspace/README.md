# shop

Order pricing, invoicing and reporting for the storefront.

- `shop/pricing.py`: money rounding, discounts, tax. Shared by everything else.
- `shop/promotions.py`: promo codes and bulk discounts.
- `shop/customers.py`: customer records imported from the CRM.
- `shop/invoice.py`: invoice lines and totals.
- `shop/reports.py`: monthly revenue reports.

Run the tests with `python -m pytest tests`. The integration tests start a fake
warehouse service and take a few seconds.
