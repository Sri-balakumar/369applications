from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    # ── Below Cost Protection Fields ────────────────────────────────
    has_below_cost_lines = fields.Boolean(
        string="Has Below Cost Lines",
        compute='_compute_has_below_cost_lines',
        store=True,
        help="Indicates if this order has lines priced below cost.",
    )
    below_cost_approved = fields.Boolean(
        string="Below Cost Approved",
        default=False,
        copy=False,
        tracking=True,
        help="Indicates if below-cost pricing has been approved "
             "by an authorized person.",
    )
    below_cost_approved_by = fields.Many2one(
        'res.users',
        string="Approved By",
        copy=False,
        tracking=True,
        help="The authorized person who approved the below-cost sale.",
    )
    below_cost_approved_date = fields.Datetime(
        string="Approval Date",
        copy=False,
        tracking=True,
    )
    below_cost_approval_reason = fields.Text(
        string="Approval Reason",
        copy=False,
        tracking=True,
    )
    below_cost_line_count = fields.Integer(
        string="Below Cost Line Count",
        compute='_compute_has_below_cost_lines',
        store=True,
    )
    needs_cost_approval = fields.Boolean(
        string="Needs Cost Approval",
        compute='_compute_needs_cost_approval',
        store=True,
        help="True if order has below-cost lines and protection is enabled "
             "but not yet approved.",
    )

    @api.depends('order_line.is_below_cost')
    def _compute_has_below_cost_lines(self):
        for order in self:
            below_cost_lines = order.order_line.filtered('is_below_cost')
            order.has_below_cost_lines = bool(below_cost_lines)
            order.below_cost_line_count = len(below_cost_lines)

    @api.depends('has_below_cost_lines', 'below_cost_approved')
    def _compute_needs_cost_approval(self):
        protection_enabled = self.env['ir.config_parameter'].sudo().get_param(
            'sale_cost_protection.enable_below_cost_protection', 'False'
        ) == 'True'
        for order in self:
            order.needs_cost_approval = (
                protection_enabled
                and order.has_below_cost_lines
                and not order.below_cost_approved
            )

    def action_confirm(self):
        """Override to check for below-cost approval before confirming."""
        protection_enabled = self.env['ir.config_parameter'].sudo().get_param(
            'sale_cost_protection.enable_below_cost_protection', 'False'
        ) == 'True'

        if protection_enabled:
            for order in self:
                # Recompute to ensure fresh data
                order.order_line._compute_is_below_cost()
                order._compute_has_below_cost_lines()

                if order.has_below_cost_lines and not order.below_cost_approved:
                    # Open the approval wizard
                    return {
                        'name': _('Below Cost Sale Approval Required'),
                        'type': 'ir.actions.act_window',
                        'res_model': 'sale.cost.approval.wizard',
                        'view_mode': 'form',
                        'target': 'new',
                        'context': {
                            'default_sale_order_id': order.id,
                            'default_below_cost_line_ids': [
                                (6, 0, order.order_line.filtered(
                                    'is_below_cost'
                                ).ids)
                            ],
                        },
                    }
        return super().action_confirm()

    def action_reset_cost_approval(self):
        """Reset below-cost approval (e.g. when order lines change)."""
        self.write({
            'below_cost_approved': False,
            'below_cost_approved_by': False,
            'below_cost_approved_date': False,
            'below_cost_approval_reason': False,
        })

    def action_notify_approvers(self):
        """Send email notification to approvers about below-cost order."""
        self.ensure_one()
        template = self.env.ref(
            'sale_cost_protection.mail_template_below_cost_notification',
            raise_if_not_found=False,
        )
        approver_group = self.env.ref(
            'sale_cost_protection.group_sale_cost_approver',
            raise_if_not_found=False,
        )
        if template and approver_group:
            self.env.cr.execute("""
                SELECT uid FROM res_groups_users_rel
                WHERE gid = %s
            """, (approver_group.id,))
            user_ids = [row[0] for row in self.env.cr.fetchall()]
            for user in self.env['res.users'].browse(user_ids):
                if user.partner_id.email:
                    template.send_mail(
                        self.id,
                        email_values={
                            'email_to': user.partner_id.email,
                        },
                        force_send=True,
                    )


class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'

    # ── Below Cost Fields ───────────────────────────────────────────
    product_cost_price = fields.Float(
        string="Cost Price",
        compute='_compute_product_cost_price',
        store=True,
        digits='Product Price',
        help="The cost price of the product based on configuration.",
    )
    is_below_cost = fields.Boolean(
        string="Below Cost",
        compute='_compute_is_below_cost',
        store=True,
        help="True if the unit price is below the cost price + minimum margin.",
    )
    margin_percentage = fields.Float(
        string="Margin (%)",
        compute='_compute_is_below_cost',
        store=True,
        digits=(12, 2),
        help="Calculated margin percentage for this line.",
    )
    minimum_required_price = fields.Float(
        string="Minimum Required Price",
        compute='_compute_is_below_cost',
        store=True,
        digits='Product Price',
        help="The minimum price required based on cost and margin settings.",
    )

    @api.depends('product_id', 'product_id.standard_price')
    def _compute_product_cost_price(self):
        cost_source = self.env['ir.config_parameter'].sudo().get_param(
            'sale_cost_protection.cost_field_source', 'standard_price'
        )
        for line in self:
            if line.product_id:
                if (
                    cost_source == 'last_purchase_price'
                    and hasattr(line.product_id, 'last_purchase_price')
                ):
                    line.product_cost_price = (
                        line.product_id.last_purchase_price or
                        line.product_id.standard_price
                    )
                else:
                    line.product_cost_price = line.product_id.standard_price
            else:
                line.product_cost_price = 0.0

    @api.depends(
        'price_unit', 'product_cost_price', 'product_id', 'discount'
    )
    def _compute_is_below_cost(self):
        min_margin = float(
            self.env['ir.config_parameter'].sudo().get_param(
                'sale_cost_protection.minimum_margin_percentage', '0.0'
            )
        )
        protection_enabled = self.env['ir.config_parameter'].sudo().get_param(
            'sale_cost_protection.enable_below_cost_protection', 'False'
        ) == 'True'

        for line in self:
            if not protection_enabled or not line.product_id:
                line.is_below_cost = False
                line.margin_percentage = 0.0
                line.minimum_required_price = 0.0
                continue

            cost = line.product_cost_price
            if cost <= 0:
                line.is_below_cost = False
                line.margin_percentage = 0.0
                line.minimum_required_price = 0.0
                continue

            # Calculate effective price after discount
            effective_price = line.price_unit * (1 - (line.discount or 0.0) / 100.0)

            # Calculate minimum required price
            min_price = cost * (1 + min_margin / 100.0)
            line.minimum_required_price = min_price

            # Calculate margin percentage
            line.margin_percentage = ((effective_price - cost) / cost) * 100.0

            # Check if below cost
            line.is_below_cost = effective_price < min_price

    @api.onchange('price_unit', 'discount')
    def _onchange_price_below_cost_warning(self):
        """Show warning when price is set below cost."""
        protection_enabled = self.env['ir.config_parameter'].sudo().get_param(
            'sale_cost_protection.enable_below_cost_protection', 'False'
        ) == 'True'
        block_completely = self.env['ir.config_parameter'].sudo().get_param(
            'sale_cost_protection.block_below_cost_completely', 'False'
        ) == 'True'

        if not protection_enabled or not self.product_id:
            return

        cost = self.product_cost_price
        if cost <= 0:
            return

        effective_price = self.price_unit * (1 - (self.discount or 0.0) / 100.0)
        min_margin = float(
            self.env['ir.config_parameter'].sudo().get_param(
                'sale_cost_protection.minimum_margin_percentage', '0.0'
            )
        )
        min_price = cost * (1 + min_margin / 100.0)

        if effective_price < min_price:
            if block_completely:
                # Check if current user is an approver
                approver_group = self.env.ref(
                    'sale_cost_protection.group_sale_cost_approver',
                    raise_if_not_found=False,
                )
                is_approver = False
                if approver_group:
                    self.env.cr.execute("""
                        SELECT 1 FROM res_groups_users_rel
                        WHERE gid = %s AND uid = %s
                    """, (approver_group.id, self.env.uid))
                    is_approver = bool(self.env.cr.fetchone())
                if not is_approver:
                    self.price_unit = min_price
                    return {
                        'warning': {
                            'title': _('Below Cost Price Blocked!'),
                            'message': _(
                                'The price %.2f is below the minimum '
                                'required price %.2f (Cost: %.2f + '
                                'Margin: %.1f%%).\n\n'
                                'Price has been reset to the minimum '
                                'allowed price. Only authorized approvers '
                                'can set prices below cost.'
                            ) % (
                                effective_price, min_price,
                                cost, min_margin,
                            ),
                        }
                    }
            return {
                'warning': {
                    'title': _('Below Cost Price Warning!'),
                    'message': _(
                        'The effective price %.2f is below the minimum '
                        'required price %.2f (Cost: %.2f + Margin: %.1f%%).'
                        '\n\nThis sale order will require approval from '
                        'an authorized person before confirmation.'
                    ) % (effective_price, min_price, cost, min_margin),
                }
            }

    def write(self, vals):
        """Reset approval when price-related fields change."""
        res = super().write(vals)
        price_fields = {'price_unit', 'discount', 'product_id', 'product_uom_qty'}
        if price_fields & set(vals.keys()):
            orders = self.mapped('order_id').filtered(
                lambda o: o.below_cost_approved
            )
            if orders:
                orders.action_reset_cost_approval()
        return res
