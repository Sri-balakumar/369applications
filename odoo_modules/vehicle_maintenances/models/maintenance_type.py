from odoo import models, fields


class MaintenanceType(models.Model):
    _name = 'maintenance.type'
    _description = 'Maintenance Type'
    _order = 'name asc'

    name = fields.Char(string='Name', required=True)
