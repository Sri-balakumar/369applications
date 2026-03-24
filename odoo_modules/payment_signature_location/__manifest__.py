{
    'name': 'Payment Signature & Location',
    'version': '19.0.1.0.0',
    'summary': 'Add customer signature and GPS location to payments',
    'description': 'Extends account.payment with customer signature, latitude, longitude, and location name fields captured from the mobile app.',
    'category': 'Accounting',
    'author': 'Custom',
    'depends': ['base', 'account'],
    'data': [
        'views/account_payment_views.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
