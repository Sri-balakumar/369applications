from odoo import api, fields, models


class SaleCostApprovalLog(models.Model):
    _name = 'sale.cost.approval.log'
    _description = 'Below Cost Sale Approval Log'
    _order = 'create_date desc'
    _rec_name = 'sale_order_id'

    sale_order_id = fields.Many2one(
        'sale.order',
        string="Sale Order",
        required=True,
        ondelete='cascade',
        index=True,
    )
    approver_id = fields.Many2one(
        'res.users',
        string="Approved By",
        required=True,
        index=True,
    )
    approval_date = fields.Datetime(
        string="Approval Date",
        default=fields.Datetime.now,
        required=True,
    )
    reason = fields.Text(
        string="Reason / Justification",
    )
    action = fields.Selection(
        [
            ('approved', 'Approved'),
            ('rejected', 'Rejected'),
            ('reset', 'Reset'),
        ],
        string="Action",
        required=True,
        default='approved',
    )
    company_id = fields.Many2one(
        related='sale_order_id.company_id',
        store=True,
    )
    partner_id = fields.Many2one(
        related='sale_order_id.partner_id',
        store=True,
        string="Customer",
    )
    order_amount_total = fields.Monetary(
        related='sale_order_id.amount_total',
        string="Order Total",
    )
    currency_id = fields.Many2one(
        related='sale_order_id.currency_id',
    )
    salesperson_id = fields.Many2one(
        related='sale_order_id.user_id',
        store=True,
        string="Salesperson",
    )

    # Store below cost line details as text for audit
    below_cost_details = fields.Text(
        string="Below Cost Line Details",
        help="Snapshot of below-cost lines at the time of approval.",
    )

    @api.model
    def create_from_mobile(self, vals):
        """Create approval log from mobile app - uses sudo to bypass access rules."""
        return self.sudo().create(vals).id
