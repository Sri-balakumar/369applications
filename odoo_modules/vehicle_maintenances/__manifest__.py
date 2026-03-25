{
    'name': 'Vehicle Maintenances',
    'version': '19.0.1.0.0',
    'category': 'Fleet',
    'summary': 'Vehicle Maintenances Management',
    'description': """
        Manage vehicle maintenance records including:
        - Maintenance types (Oil Change, Body Wash, Tyre Change, etc.)
        - Track current KM, amount, driver, vehicle
        - Handover images (before/after)
        - Attachment details and remarks
    """,
    'author': 'Custom',
    'depends': ['base', 'fleet'],
    'data': [
        'security/ir.model.access.csv',
        'data/maintenance_type_data.xml',
        'views/maintenance_type_views.xml',
        'views/cash_collection_views.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
