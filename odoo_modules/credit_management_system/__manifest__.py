{
    'name': 'Credit Management System',
    'version': '19.0.3.0.0',
    'category': 'Sales',
    'summary': 'Advanced Credit Management with WhatsApp & Email Approval',
    'description': """
        Credit Management System with WhatsApp & Email Integration
        ==========================================================
        
        Uses WhatsApp Neonize (Pure Python) - No Node.js required!
        
        Core Features:
        --------------
        * Customer credit limit management
        * Automatic credit approval workflow
        * WhatsApp integration via Neonize (reply 1-ORDER / 2-ORDER)
        * Email integration with clickable APPROVE/REJECT buttons
        * Risk scoring and analytics
        * Credit hold management
        * Real-time notifications
        * Cross-channel notification sync
    """,
    'author': 'Nishanthini J',
    'website': 'https://www.yourcompany.com',
    'depends': [
        'base',
        'sale',
        'sale_management',
        'account',
        'mail',
        'web',
        'whatsapp_neonize',
        'easy_sales',
    ],
    'data': [
        # Security (ORDER MATTERS!)
        'security/security.xml',
        'security/ir.model.access.csv',
        
        # Data - Email templates and WhatsApp integration
        'data/mail_templates.xml',
        'data/whatsapp_integration_data.xml',
        'data/ir_cron_credit_replies.xml',
        
        # Views
        'views/res_partner_view.xml',
        'views/sale_order_view.xml',
        'views/credit_limit_dashboard.xml',
        'views/risk_score_history_view.xml',
        'views/whatsapp_integration_views.xml',
        'views/easy_sales_inherit_views.xml',
        'views/credit_facility_view.xml',
        
        # Wizards
        'wizards/sale_order_credit_approval_wizard_view.xml',
        'wizards/credit_facility_wizard_view.xml',
        'wizards/easy_sales_credit_approval_wizard_view.xml',
    ],
    'demo': [],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
    'pre_init_hook': 'pre_init_hook',
    'post_init_hook': 'post_init_hook',
}
