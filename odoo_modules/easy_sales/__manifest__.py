{
    'name': 'Easy Sales',
    'version': '19.0.1.6.0',
    'category': 'Sales/Sales',
    'summary': 'One-click sales entry for small businesses with payment modes',
    'description': """
        Easy Sales Module
        =================
        - Single form for sales entry
        - Auto-creates customer invoice
        - Auto-delivers inventory
        - No quotation workflow
        - Multiple payment modes (Cash, Bank, Card, etc.)
        - Split payments support
        - Auto-register payments on invoice
        - Perfect for small businesses and retail shops
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
        'data/easy_sales_data.xml',
        'views/easy_sales_payment_method_views.xml',
        'views/easy_sales_views.xml',
        'views/easy_sales_menus.xml',
    ],
    'assets': {},
    'post_init_hook': '_create_default_payment_methods',
    'installable': True,
    'application': True,
    'auto_install': False,
}
