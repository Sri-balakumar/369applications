from odoo import models, fields


class AccountPaymentSignature(models.Model):
    _inherit = 'account.payment'

    customer_signature = fields.Binary(string='Customer Signature', attachment=True)
    employee_signature = fields.Binary(string='Employee Signature', attachment=True)
    latitude = fields.Float(string='Latitude', digits=(10, 7))
    longitude = fields.Float(string='Longitude', digits=(10, 7))
    location_name = fields.Char(string='Location Name')
