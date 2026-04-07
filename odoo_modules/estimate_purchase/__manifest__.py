{
    'name': 'Estimate Purchase',
    'version': '19.0.1.0.0',
    'category': 'Inventory/Purchase',
    'summary': 'One-click estimate/proforma purchase entry without tax',
    'description': """
Estimate Purchase Module
========================
- Single form for estimate/proforma purchase entry
- Fully tax-free (no tax fields at all)
- Auto-creates purchase order, receipt, bill & payment
- Payment method configuration
- Perfect for estimate/without-tax purchases
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': ['purchase', 'stock', 'account'],
    'data': [
        'security/ir.model.access.csv',
        'security/estimate_purchase_security.xml',
        'views/estimate_purchase_payment_method_views.xml',
        'views/estimate_purchase_views.xml',
        'views/estimate_purchase_menus.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
