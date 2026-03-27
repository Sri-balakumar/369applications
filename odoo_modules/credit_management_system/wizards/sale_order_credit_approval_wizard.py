from odoo import models, fields, api, _


class SaleOrderCreditApprovalWizard(models.TransientModel):
    _name = 'sale.order.credit.approval.wizard'
    _description = 'Sale Order Credit Approval Wizard'

    order_id = fields.Many2one('sale.order', string='Order', required=True)
    partner_id = fields.Many2one('res.partner', string='Customer', required=True)
    order_amount = fields.Monetary(string='Order Amount', currency_field='currency_id')
    current_credit_limit = fields.Monetary(string='Current Credit Limit', currency_field='currency_id')
    current_due = fields.Monetary(string='Current Due', currency_field='currency_id')
    risk_score = fields.Float(string='Current Risk Score', digits=(5, 2))
    risk_level = fields.Selection([
        ('low', 'Low Risk'),
        ('medium', 'Medium Risk'),
        ('high', 'High Risk'),
    ], string='Current Risk Level')
    
    future_total = fields.Monetary(
        string='Future Total (After Order)', 
        compute='_compute_future_total', 
        currency_field='currency_id',
        help='Total amount due after confirming this order'
    )
    
    currency_id = fields.Many2one('res.currency', default=lambda self: self.env.company.currency_id)

    @api.depends('current_due', 'order_amount')
    def _compute_future_total(self):
        for wizard in self:
            wizard.future_total = wizard.current_due + wizard.order_amount

    def action_approve(self):
        """Approve and confirm order WITHOUT changing credit limit."""
        self.ensure_one()
        
        self.order_id.action_approve_credit_override()
        
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Order Approved'),
                'message': _('Order %s has been approved! Credit limit remains at %s %s. This is a one-time override for this order only. Email notification has been sent to Administrator.') % (
                    self.order_id.name,
                    self.currency_id.symbol,
                    '{:,.2f}'.format(self.current_credit_limit)
                ),
                'type': 'success',
                'sticky': False,
            }
        }

    def action_reject(self):
        """Reject the order."""
        self.ensure_one()
        
        self.order_id.action_reject_credit_override()
        
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Order Rejected'),
                'message': _('Order %s has been rejected due to credit limit exceeded. Email notification has been sent to Administrator.') % self.order_id.name,
                'type': 'danger',
                'sticky': False,
            }
        }