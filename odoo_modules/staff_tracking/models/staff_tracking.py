from odoo import models, fields


class StaffTracking(models.Model):
    _name = 'staff.tracking'
    _description = 'Staff Check-In/Check-Out Tracking'
    _order = 'check_in_time desc, id desc'

    employee_id = fields.Many2one(
        'hr.employee', string='Employee', index=True)
    department_id = fields.Many2one(
        'hr.department', string='Department')
    check_in_time = fields.Datetime(string='Check-In Time')
    check_out_time = fields.Datetime(string='Check-Out Time')
    status = fields.Selection([
        ('check_in', 'Check In'),
        ('check_out', 'Check Out'),
    ], string='Status', default='check_in')
    latitude = fields.Float(string='Latitude', digits=(16, 8))
    longitude = fields.Float(string='Longitude', digits=(16, 8))
    location_name = fields.Char(string='Location')
    remarks = fields.Text(string='Remarks')
