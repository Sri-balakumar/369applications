{
    'name': 'Offline Sync',
    'version': '19.0.1.0.0',
    'category': 'Tools',
    'summary': 'Local/Online data toggle with sync, delete, and cross-check',
    'description': """
Offline Sync — Local Data Buffer & Queue
=========================================
Provides a configuration screen to select apps and models, toggle between
local and online storage modes, sync local data to Odoo, delete local data,
and run hourly cross-checks to verify data integrity.

Other modules depend on this as a sub-module for offline-capable data entry.
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': ['base', 'mail'],
    'data': [
        'security/offline_sync_security.xml',
        'security/ir.model.access.csv',
        'data/ir_cron.xml',
        'views/offline_sync_config_views.xml',
        'views/offline_sync_queue_views.xml',
        'views/menu.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'offline_sync/static/src/css/offline_sync.css',
            'offline_sync/static/src/js/utils/idb_helper.js',
            'offline_sync/static/src/js/services/network_monitor_service.js',
            'offline_sync/static/src/js/services/local_storage_service.js',
            'offline_sync/static/src/js/services/offline_sync_service.js',
            'offline_sync/static/src/js/systray/offline_status_item.js',
            'offline_sync/static/src/xml/offline_status_systray.xml',
        ],
    },
    'installable': True,
    'application': True,
    'auto_install': False,
}
