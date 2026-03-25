{
    'name': 'Mobile Sales Order',
    'version': '19.0.1.0.0',
    'category': 'Sales',
    'summary': 'Mobile app sales order with one-click invoice and delivery',
    'description': """
Mobile Sales Order Module
=========================

A streamlined sales order interface designed for the mobile app.

Features:
---------
* Create sales orders from the mobile app
* Select customer, warehouse, and payment method
* Add product lines with quantities and prices
* One-click confirm that automatically:
    - Creates and confirms a Sale Order
    - Creates delivery and validates stock
    - Creates and posts a Customer Invoice
    - Registers payment (if payment method selected)
* Direct Invoice flow for quick billing
* Full accounting and inventory integrity
* Proper sequence numbering (MSO/YYYY/XXXXX)

Workflow:
---------
1. Create Order → Add Products → Confirm → Done (SO + Delivery + Invoice created)
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': [
        'sale',
        'sale_management',
        'stock',
        'account',
        'sale_stock',
        'mail',
    ],
    'data': [
        'security/mobile_sales_order_security.xml',
        'security/ir.model.access.csv',
        'views/mobile_sales_order_views.xml',
        'views/mobile_sales_order_menus.xml',
    ],
    'assets': {},
    'installable': True,
    'application': True,
    'auto_install': False,
}
