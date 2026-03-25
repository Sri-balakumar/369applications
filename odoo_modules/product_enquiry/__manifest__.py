{
    'name': 'Product Enquiry',
    'version': '19.0.1.0.0',
    'summary': 'Product Enquiry Management',
    'description': 'Manage product enquiries from mobile app with attachments and signatures.',
    'category': 'Sales',
    'author': 'Custom',
    'depends': ['base', 'mail'],
    'data': [
        'security/ir.model.access.csv',
        'data/ir_sequence_data.xml',
        'views/product_enquiry_views.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
