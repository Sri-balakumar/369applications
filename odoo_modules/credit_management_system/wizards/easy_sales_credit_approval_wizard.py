from odoo import models, fields, api, _


class EasySalesCreditApprovalWizard(models.TransientModel):
    _name = 'easy.sales.credit.approval.wizard'
    _description = 'Easy Sales Credit Approval Wizard'

    sale_id = fields.Many2one('easy.sales', string='Easy Sale', required=True)
    partner_id = fields.Many2one('res.partner', string='Customer', required=True)
    sale_amount = fields.Monetary(string='Sale Amount', currency_field='currency_id')
    current_credit_limit = fields.Monetary(string='Credit Limit', currency_field='currency_id')
    current_due = fields.Monetary(string='Current Due', currency_field='currency_id')
    exceeds_by = fields.Monetary(string='Exceeds By', currency_field='currency_id')
    risk_score = fields.Float(string='Risk Score', digits=(5, 2))
    risk_level = fields.Selection([
        ('low', 'Low Risk'),
        ('medium', 'Medium Risk'),
        ('high', 'High Risk'),
    ], string='Risk Level')

    currency_id = fields.Many2one(
        'res.currency',
        default=lambda self: self.env.company.currency_id,
    )

    def action_approve(self):
        """Approve credit and complete the easy sale."""
        self.ensure_one()
        self.sale_id.action_approve_easy_sale_credit()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Easy Sale Approved'),
                'message': _(
                    'Easy Sale %s has been approved and confirmed.'
                ) % self.sale_id.name,
                'type': 'success',
                'sticky': False,
            }
        }

    def action_reject(self):
        """Reject the easy sale credit."""
        self.ensure_one()
        self.sale_id.action_reject_easy_sale_credit()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Easy Sale Rejected'),
                'message': _(
                    'Easy Sale %s has been rejected due to credit limit exceeded.'
                ) % self.sale_id.name,
                'type': 'danger',
                'sticky': False,
            }
        }
