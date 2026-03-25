from odoo import models, fields


class EmployeeDevice(models.Model):
    _name = 'employee.device'
    _description = 'Employee Device'
    _order = 'last_used desc'

    employee_id = fields.Many2one('hr.employee', string='Employee', required=True, ondelete='cascade')
    device_id = fields.Char(string='Device ID', required=True)
    device_name = fields.Char(string='Device Name')
    device_type = fields.Selection([
        ('android', 'Android'),
        ('ios', 'iOS'),
    ], string='Device Type', default='android')
    active = fields.Boolean(string='Active', default=True)
    last_used = fields.Datetime(string='Last Used')
