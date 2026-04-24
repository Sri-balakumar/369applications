{
    "name": "HR Work From Home Request",
    "version": "1.0",
    "author": "Alphalize Technologies",
    "category": "Human Resources",
    "summary": "WFH Request with Manager Approval + Mobile Check-in/Check-out",
    "description": """
        Work From Home Management Module
        =================================
        - Employee requests WFH for a specific date with reason
        - Manager/Admin approves or rejects the request
        - Once approved, employee can check-in / check-out from mobile app
          (fingerprint required, geo-fencing bypassed)
        - On check-in/check-out, hr.attendance record is auto-created
          tagged as 'wfh' for tracking
        - Integrates with KRA/KPI module's attendance sync
    """,
    "depends": ["base", "web", "hr", "hr_attendance"],

    "data": [
        "security/wfh_groups.xml",
        "security/ir.model.access.csv",
        "security/wfh_security_rules.xml",
        "views/wfh_request_views.xml",
        "views/menu.xml",
    ],

    "installable": True,
    "application": False,
    "auto_install": False,
}
