{
    'name': 'Mobile Invoice PDF Report',
    'version': '17.0.1.0.0',
    'category': 'Accounting',
    'summary': 'Custom PDF invoice report matching the mobile app invoice format',
    'description': 'Generates PDF invoices with company details, product table, and grand total - designed for mobile app integration.',
    'depends': ['account'],
    'data': [
        'reports/invoice_report_action.xml',
        'reports/invoice_report.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
