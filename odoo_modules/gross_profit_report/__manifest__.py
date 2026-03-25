# -*- coding: utf-8 -*-
{
    'name': 'Gross Profit Report',
    'version': '19.0.1.0.0',
    'summary': 'Product, Salesperson & Company wise Gross Profit Analysis',
    'description': """
Gross Profit Report
===================
* Product-wise GP Report
* Salesperson-wise GP Report
* Customer-wise GP Report
* Category-wise GP Report
* Company-wise GP Report
* Excel Export & PDF Print
* Formula: GP = Sales Revenue - COGS
    """,
    'category': 'Accounting/Reporting',
    'author': 'Alphalize',
    'license': 'LGPL-3',
    'depends': ['account', 'sale', 'stock', 'sale_stock'],
    'data': [
        'security/ir.model.access.csv',
        'wizard/gp_report_wizard_views.xml',
        'views/gp_report_views.xml',
        'views/menu_views.xml',
        'report/gp_report_templates.xml',
        'report/gp_report_actions.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
