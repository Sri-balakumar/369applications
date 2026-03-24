{
    'name': 'Door Monitoring - Face Recognition',
    'version': '19.0.1.0.0',
    'category': 'Human Resources/Attendance',
    'summary': 'Camera at office door detects staff movement and reports mismatches with app attendance',
    'description': """
        Door Monitoring with Face Recognition
        =======================================
        Staff check-in/check-out is done through the mobile app.
        But some staff may leave the office without checking out.

        This module:
        - Installs a camera at the office door
        - Detects and identifies staff using AI face recognition
        - Logs every detection (who passed through the door, with snapshot)
        - Compares door detections with app attendance records
        - Generates a MISMATCH REPORT showing staff who were seen at the door
          but did NOT check-in/check-out through the app
        - Helps management identify unauthorized exits/entries
    """,
    'author': 'Amal',
    'depends': ['hr', 'hr_attendance'],
    'data': [
        'security/ir.model.access.csv',
        'views/face_employee_views.xml',
        'views/face_attendance_views.xml',
        'views/menu.xml',
    ],
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}
