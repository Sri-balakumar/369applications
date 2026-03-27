from odoo import models, fields


class WhatsAppMessageInherit(models.Model):
    _inherit = 'whatsapp.message'

    is_credit_processed = fields.Boolean(
        string='Credit Processed',
        default=False,
        help='Whether this message has been checked for credit approval patterns',
    )
