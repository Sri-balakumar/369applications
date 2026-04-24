from odoo import api, models, fields


class HrAttendanceInherit(models.Model):
    """
    Inherit hr.attendance to add WFH tracking fields.
    This allows the KRA/KPI module's _sync_attendance_data to automatically
    pick up WFH attendance records without any modifications.
    """
    _inherit = "hr.attendance"

    # Work location tracking
    work_location = fields.Selection([
        ('office', 'Office'),
        ('wfh', 'Work From Home'),
        ('client', 'Client Site'),
        ('other', 'Other'),
    ], string='Work Location', default='office',
        help="Where the employee worked from during this attendance")

    # Link back to WFH request (if attendance was created via WFH check-in)
    wfh_request_id = fields.Many2one(
        'hr.wfh.request',
        string='WFH Request',
        ondelete='set null',
        readonly=True,
        help="The WFH request that created this attendance record"
    )

    is_wfh = fields.Boolean(
        string='Is WFH',
        compute='_compute_is_wfh',
        store=True,
    )

    @api.depends('work_location')
    def _compute_is_wfh(self):
        for rec in self:
            rec.is_wfh = rec.work_location == 'wfh'
