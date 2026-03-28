{
    'name': 'Sale Below Cost Protection',
    'version': '19.0.1.0.0',
    'category': 'Sales',
    'summary': 'Protect against below-cost sales with authorized person approval',
    'description': """
Sale Below Cost Protection
==========================

This module provides comprehensive protection against selling products 
at or below cost price. Key features:

* **Below Cost Detection**: Automatically detects when a sale order line 
  price is at or below the product cost.
* **Authorized Approvers**: Configure authorized persons who can approve 
  below-cost sales.
* **Approval Workflow**: Sale orders with below-cost lines require approval 
  from authorized persons before confirmation.
* **Minimum Margin Configuration**: Set minimum margin percentage globally 
  or per product category.
* **Audit Trail**: Complete log of all below-cost approvals with timestamps, 
  approver details, and reasons.
* **Multi-Company Support**: Works across multiple companies.
* **Universal Compatibility**: Designed for any Odoo 19 database.

Configuration
-------------
1. Go to Sales > Configuration > Below Cost Protection Settings
2. Enable below cost protection
3. Set minimum margin percentage (default 0%)
4. Assign authorized approvers (users with 'Below Cost Sale Approver' group)

Usage
-----
1. Create a Sale Order as usual
2. If any line has a price below cost + minimum margin, the order 
   will be flagged
3. On confirmation, a popup will request approval from an authorized person
4. The authorized person must enter their credentials and optionally a reason
5. Once approved, the sale order can be confirmed

    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': ['sale_management', 'product'],
    'data': [
        'security/sale_cost_protection_groups.xml',
        'security/ir.model.access.csv',
        'security/sale_cost_protection_rules.xml',
        'data/mail_template_data.xml',
        'views/res_config_settings_views.xml',
        'views/sale_order_views.xml',
        'views/sale_cost_approval_log_views.xml',
        'wizard/sale_cost_approval_wizard_views.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}
