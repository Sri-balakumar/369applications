from odoo import models, api, _
from odoo.exceptions import ValidationError


class AccountPayment(models.Model):
    _inherit = 'account.payment'

    @api.constrains('partner_id', 'amount')
    def _check_payment_mandatory_fields(self):
        for rec in self:
            if rec.payment_type == 'inbound':
                if not rec.partner_id:
                    raise ValidationError(
                        _("Customer is required for customer payments.")
                    )
                if not rec.amount or rec.amount <= 0:
                    raise ValidationError(
                        _("Amount must be greater than zero for customer payments.")
                    )
