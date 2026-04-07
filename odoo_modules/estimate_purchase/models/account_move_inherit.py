from odoo import models, fields


class AccountMoveSourceModule(models.Model):
    _inherit = 'account.move'

    source_module = fields.Char(
        string='Source Module',
        index=True,
        copy=False,
        help='Technical field to identify which module created this invoice/bill',
    )
