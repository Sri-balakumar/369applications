{
    'name': 'Payment Mandatory Fields',
    'version': '19.0.1.0.0',
    'category': 'Accounting',
    'summary': 'Makes Customer and Amount mandatory in Customer Payments',
    'description': """
        This module ensures that Customer and Amount fields are mandatory
        when creating Customer Payments (Receive type).
        - Customer field is required
        - Amount must be greater than zero
    """,
    'author': 'Alphalize Technologies',
    'depends': ['account'],
    'data': [
        'views/account_payment_views.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
