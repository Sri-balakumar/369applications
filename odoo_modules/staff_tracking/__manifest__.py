{
    'name': 'Staff Tracking',
    'version': '19.0.1.0.0',
    'category': 'Human Resources',
    'summary': 'Staff Check-In/Check-Out & Live Location Tracking',
    'description': """
        Staff Tracking module for managing:
        - Staff check-in and check-out records with GPS location
        - Live user location tracking (real-time GPS updates from mobile app)
        - Department-wise tracking
        - Location history with reverse geocoded addresses
    """,
    'author': 'Custom',
    'depends': ['base', 'hr'],
    'data': [
        'security/ir.model.access.csv',
        'views/staff_tracking_views.xml',
        'views/user_location_views.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
