from odoo import models, fields


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    device_ids = fields.One2many('employee.device', 'employee_id', string='Devices')
