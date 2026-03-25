{
    'name': 'User Tracking',
    'version': '19.0.1.0.0',
    'category': 'Human Resources',
    'summary': 'User Live Location Tracking',
    'description': """
        User Tracking module for managing:
        - Live user location tracking (real-time GPS updates from mobile app)
        - Location history with reverse geocoded addresses
    """,
    'author': 'Custom',
    'depends': ['base'],
    'data': [
        'security/ir.model.access.csv',
        'views/user_location_views.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
