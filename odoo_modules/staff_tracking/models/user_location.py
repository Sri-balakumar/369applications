from odoo import models, fields


class UserLocation(models.Model):
    _name = 'user.location'
    _description = 'User Live Location'
    _order = 'last_updated desc'

    user_id = fields.Integer(string='User ID', required=True, index=True)
    latitude = fields.Float(string='Latitude', digits=(16, 8))
    longitude = fields.Float(string='Longitude', digits=(16, 8))
    location_name = fields.Char(string='Location Name')
    last_updated = fields.Datetime(string='Last Updated')
    accuracy = fields.Float(string='Accuracy (m)', digits=(12, 2))
