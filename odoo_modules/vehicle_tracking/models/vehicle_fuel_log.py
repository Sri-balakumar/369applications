# -*- coding: utf-8 -*-
from odoo import api, fields, models

class VehicleFuelLog(models.Model):
    _name = 'vehicle.fuel.log'
    _description = 'Vehicle Fuel Log'
    _order = 'create_date desc'

    # Primary Key
    name = fields.Char(string="Ref", default="New", readonly=True)

    # Foreign Keys

    vehicle_id = fields.Many2one(
        'fleet.vehicle',
        string='Vehicle',
        required=True
    )

    vehicle_tracking_id = fields.Many2one(
        'vehicle.tracking',
        string='Vehicle Tracking',
        required=True
    )

    driver_id = fields.Many2one(
        'res.partner',
        string='Driver',
        domain="[('is_company','=',False)]",
        required=True
    )

    # Fuel & Amount
    amount = fields.Float(string='Amount (OMR)', required=True)
    fuel_level = fields.Float(string='Fuel Level (Litres)', required=True)
    odometer = fields.Float(string='Odometer Reading', help="Reading at fuel stop")

    # Upload image
    upload_path = fields.Char(string='Upload Path')
    odometer_image = fields.Binary(string='Odometer Image', required=False)
    odometer_image_filename = fields.Char(string="Document Name")

    # GPS Tracking
    gps_lat = fields.Char(string='GPS Latitude')
    gps_long = fields.Char(string='GPS Longitude')

    # Auto timestamp
    create_date = fields.Datetime(
        string='Created Date',
        default=fields.Datetime.now,
        readonly=True
    )

    @api.model_create_multi
    def create(self, vals_list):
        """Auto sequence for reference"""
        for vals in vals_list:
            if vals.get('name', 'New') == 'New':
                vals['name'] = self.env['ir.sequence'].next_by_code('vehicle.fuel.log') or 'New'
        return super(VehicleFuelLog, self).create(vals_list)

    def action_save_fuel_log(self):
        """Close the popup after saving"""
        return {'type': 'ir.actions.act_window_close'}