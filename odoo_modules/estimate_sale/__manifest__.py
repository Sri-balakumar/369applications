{
    'name': 'Estimate Sale',
    'version': '19.0.1.0.0',
    'category': 'Sales/Sales',
    'summary': 'One-click estimate/proforma sales entry without tax',
    'description': """
        Estimate Sale Module
        ====================
        - Single form for estimate/proforma sales entry
        - Fully tax-free (no tax fields at all)
        - Auto-creates sale order, delivery, invoice & payment
        - Multiple payment modes (Cash, Bank, Card, etc.)
        - Split payments support
        - Auto-register payments on invoice
        - Perfect for estimate/without-tax sales
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': [
        'sale_management',
        'stock',
        'account',
    ],
    'data': [
        'security/ir.model.access.csv',
        'security/estimate_sale_security.xml',
        'data/estimate_sale_data.xml',
        'views/estimate_sale_payment_method_views.xml',
        'views/estimate_sale_views.xml',
        'views/estimate_sale_menus.xml',
    ],
    'assets': {},
    'installable': True,
    'application': True,
    'auto_install': False,
}
