from odoo import models, fields

class VehicleLocation(models.Model):
    _name = 'vehicle.location'
    _description = 'Vehicle Location'

    name = fields.Char(string='Location Name', required=True)
    latitude = fields.Float(string='Latitude', required=True)
    longitude = fields.Float(string='Longitude', required=True)
    location = fields.Char(string='Location', required=True)
