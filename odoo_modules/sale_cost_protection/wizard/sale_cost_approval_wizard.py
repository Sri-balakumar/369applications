import logging

from odoo import api, fields, models, _
from odoo.exceptions import UserError, AccessDenied

_logger = logging.getLogger(__name__)


class SaleCostApprovalWizard(models.TransientModel):
    _name = 'sale.cost.approval.wizard'
    _description = 'Below Cost Sale Approval Wizard'

    sale_order_id = fields.Many2one(
        'sale.order',
        string="Sale Order",
        required=True,
        readonly=True,
    )
    partner_id = fields.Many2one(
        related='sale_order_id.partner_id',
        string="Customer",
    )
    amount_total = fields.Monetary(
        related='sale_order_id.amount_total',
        string="Order Total",
    )
    currency_id = fields.Many2one(
        related='sale_order_id.currency_id',
    )

    # Approver authentication
    approver_id = fields.Many2one(
        'res.users',
        string="Authorized Approver",
        required=True,
        help="Select the authorized person who is approving this sale.",
    )
    approver_password = fields.Char(
        string="Approver Password",
        required=True,
        help="The approver must enter their password to authenticate.",
    )
    reason = fields.Text(
        string="Reason / Justification",
        help="Optional reason for approving this below-cost sale.",
    )

    # Below cost line details (readonly display)
    below_cost_line_ids = fields.Many2many(
        'sale.order.line',
        string="Below Cost Lines",
        readonly=True,
    )
    below_cost_summary = fields.Html(
        string="Below Cost Summary",
        compute='_compute_below_cost_summary',
    )

    @api.depends('sale_order_id')
    def _compute_below_cost_summary(self):
        for wizard in self:
            order = wizard.sale_order_id
            if not order:
                wizard.below_cost_summary = ''
                continue

            lines = order.order_line.filtered('is_below_cost')
            html = '<table style="width:100%; border-collapse:collapse;">'
            html += (
                '<tr style="background:#875A7B; color:white;">'
                '<th style="padding:8px; border:1px solid #ddd;">Product</th>'
                '<th style="padding:8px; border:1px solid #ddd;">Unit Price</th>'
                '<th style="padding:8px; border:1px solid #ddd;">Cost Price</th>'
                '<th style="padding:8px; border:1px solid #ddd;">Min Price</th>'
                '<th style="padding:8px; border:1px solid #ddd;">Margin %</th>'
                '<th style="padding:8px; border:1px solid #ddd;">Qty</th>'
                '</tr>'
            )

            for line in lines:
                margin_color = 'red' if line.margin_percentage < 0 else 'orange'
                html += (
                    '<tr>'
                    '<td style="padding:8px; border:1px solid #ddd;">'
                    f'{line.product_id.display_name}</td>'
                    '<td style="padding:8px; border:1px solid #ddd; '
                    f'text-align:right;">{line.price_unit:.2f}</td>'
                    '<td style="padding:8px; border:1px solid #ddd; '
                    f'text-align:right;">{line.product_cost_price:.2f}</td>'
                    '<td style="padding:8px; border:1px solid #ddd; '
                    f'text-align:right;">{line.minimum_required_price:.2f}</td>'
                    f'<td style="padding:8px; border:1px solid #ddd; '
                    f'text-align:right; color:{margin_color};">'
                    f'{line.margin_percentage:.2f}%</td>'
                    '<td style="padding:8px; border:1px solid #ddd; '
                    f'text-align:right;">{line.product_uom_qty:.0f}</td>'
                    '</tr>'
                )

            html += '</table>'
            wizard.below_cost_summary = html

    def _authenticate_approver(self):
        """Authenticate the approver by verifying their password."""
        self.ensure_one()

        # Check if user is in the approver group
        approver_group = self.env.ref(
            'sale_cost_protection.group_sale_cost_approver',
            raise_if_not_found=False,
        )
        if approver_group:
            self.env.cr.execute("""
                SELECT 1 FROM res_groups_users_rel
                WHERE gid = %s AND uid = %s
            """, (approver_group.id, self.approver_id.id))
            if not self.env.cr.fetchone():
                raise UserError(_(
                    'User "%s" is not an authorized below-cost sale approver.'
                ) % self.approver_id.name)

        # Verify password using Odoo's built-in authentication
        try:
            self.env['res.users'].with_user(self.approver_id)._check_credentials(
                {'type': 'password', 'password': self.approver_password},
                {'interactive': False},
            )
        except AccessDenied:
            raise UserError(_(
                'Authentication failed! The password entered for '
                'user "%s" is incorrect.\n\n'
                'Please enter the correct password to approve '
                'this below-cost sale.'
            ) % self.approver_id.name)

    def _get_below_cost_details_text(self):
        """Generate a text snapshot of below-cost lines for audit log."""
        self.ensure_one()
        lines = self.sale_order_id.order_line.filtered('is_below_cost')
        details = []
        for line in lines:
            details.append(
                f"Product: {line.product_id.display_name} | "
                f"Price: {line.price_unit:.2f} | "
                f"Cost: {line.product_cost_price:.2f} | "
                f"Min Required: {line.minimum_required_price:.2f} | "
                f"Margin: {line.margin_percentage:.2f}% | "
                f"Qty: {line.product_uom_qty:.0f}"
            )
        return '\n'.join(details)

    def action_approve(self):
        """Approve the below-cost sale and confirm the order."""
        self.ensure_one()

        # Step 1: Authenticate approver
        self._authenticate_approver()

        order = self.sale_order_id

        # Step 2: Mark as approved
        order.write({
            'below_cost_approved': True,
            'below_cost_approved_by': self.approver_id.id,
            'below_cost_approved_date': fields.Datetime.now(),
            'below_cost_approval_reason': self.reason,
        })

        # Step 3: Create audit log
        self.env['sale.cost.approval.log'].sudo().create({
            'sale_order_id': order.id,
            'approver_id': self.approver_id.id,
            'reason': self.reason,
            'action': 'approved',
            'below_cost_details': self._get_below_cost_details_text(),
        })

        # Step 4: Log in chatter
        body = _(
            '<strong>Below Cost Sale Approved</strong><br/>'
            'Approved by: <b>%s</b><br/>'
            'Date: %s<br/>'
            'Reason: %s<br/>'
            'Below cost lines: %d'
        ) % (
            self.approver_id.name,
            fields.Datetime.now(),
            self.reason or 'No reason provided',
            order.below_cost_line_count,
        )
        order.message_post(body=body, message_type='notification')

        # Step 5: Proceed with confirmation
        return order.with_context(
            skip_below_cost_check=True,
        ).action_confirm()

    def action_reject(self):
        """Reject the below-cost sale."""
        self.ensure_one()

        # Still authenticate to ensure authorized person is rejecting
        self._authenticate_approver()

        order = self.sale_order_id

        # Create audit log for rejection
        self.env['sale.cost.approval.log'].sudo().create({
            'sale_order_id': order.id,
            'approver_id': self.approver_id.id,
            'reason': self.reason,
            'action': 'rejected',
            'below_cost_details': self._get_below_cost_details_text(),
        })

        # Log in chatter
        body = _(
            '<strong>Below Cost Sale Rejected</strong><br/>'
            'Rejected by: <b>%s</b><br/>'
            'Date: %s<br/>'
            'Reason: %s'
        ) % (
            self.approver_id.name,
            fields.Datetime.now(),
            self.reason or 'No reason provided',
        )
        order.message_post(body=body, message_type='notification')

        return {'type': 'ir.actions.act_window_close'}
