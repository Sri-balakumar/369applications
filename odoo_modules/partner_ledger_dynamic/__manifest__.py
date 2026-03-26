{
    'name': 'Partner Ledger - Generate Report',
    'version': '19.0.1.0.0',
    'category': 'Accounting',
    'summary': 'Adds Generate Report button to existing Partner Ledger wizard',
    'description': """
Partner Ledger - Generate Report
=================================
Adds a "Generate Report" button to the EXISTING Partner Ledger wizard
(from accounting_pdf_reports / om_account_accountant).

When clicked, it opens a clean on-screen Odoo form view with:
• Refresh, PDF Report, Excel Export buttons
• Partner Summary tab (one row per partner)
• Detailed Entries tab (every journal item with running balance)
• Grand totals
    """,
    'author': 'Alphalize Technologies',
    'license': 'LGPL-3',
    'depends': [
        'accounting_pdf_reports',
    ],
    'data': [
        'security/ir.model.access.csv',
        'wizard/partner_ledger_inherit_view.xml',
        'views/partner_ledger_report_views.xml',
        'report/partner_ledger_pdf.xml',
        'report/partner_ledger_pdf_template.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
