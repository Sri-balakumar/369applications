{
    'name': 'Transaction Auditing',
    'version': '19.0.1.0.0',
    'summary': 'Transaction Auditing from Mobile App',
    'description': 'Audit transactions by scanning QR codes from invoices, vendor bills, and other documents.',
    'category': 'Accounting',
    'author': 'Custom',
    'depends': ['base', 'account'],
    'data': [
        'security/ir.model.access.csv',
        'data/ir_sequence_data.xml',
        'views/transaction_auditing_views.xml',
        'views/report_invoice_qr.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
