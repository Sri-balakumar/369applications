{
    'name': 'Quick Sales Return',
    'version': '19.0.1.1.0',
    'category': 'Sales',
    'summary': 'POS-style sales return for small businesses',
    'description': """
Quick Sales Return Module
=========================

A simple, single-screen sales return interface designed for small businesses.

Features:
---------
* Select any posted Customer Invoice
* Automatically loads all product lines
* Enter partial or full return quantities
* Prevents over-returning (validates against already returned quantities)
* One-click creation of:
    - Customer Credit Note (properly linked to original invoice)
    - Sales Return Stock Picking (incoming from customer)
* Auto-reconciliation of credit note with original invoice
* Full accounting and inventory integrity
* Lot/Serial number support for tracked products
* No modification of core Odoo logic

Workflow:
---------
1. Open Sales Return → Select Invoice → Enter Return Qty → Confirm → Done

The module creates proper accounting entries and stock movements while
maintaining full traceability and audit compliance.
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': [
        'sale',
        'stock',
        'account',
        'sale_stock',
    ],
    'data': [
        'security/ir.model.access.csv',
        'security/quick_sales_return_security.xml',
        'views/quick_sales_return_views.xml',
        'views/quick_sales_return_menus.xml',
    ],
    'assets': {},
    'installable': True,
    'application': True,
    'auto_install': False,
}
