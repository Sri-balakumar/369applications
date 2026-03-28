from odoo import api, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    # ── Below Cost Protection Settings ──────────────────────────────
    enable_below_cost_protection = fields.Boolean(
        string="Enable Below Cost Protection",
        config_parameter='sale_cost_protection.enable_below_cost_protection',
        help="When enabled, sale orders with products priced at or below "
             "cost will require approval from an authorized person.",
    )
    minimum_margin_percentage = fields.Float(
        string="Minimum Margin (%)",
        config_parameter='sale_cost_protection.minimum_margin_percentage',
        default=0.0,
        help="Minimum margin percentage required. Sales below this margin "
             "will trigger the approval workflow.\n"
             "Example: Set to 5 to require at least 5%% margin on all sales.",
    )
    cost_field_source = fields.Selection(
        [
            ('standard_price', 'Cost Price (Standard Price)'),
            ('last_purchase_price', 'Last Purchase Price'),
        ],
        string="Cost Price Source",
        config_parameter='sale_cost_protection.cost_field_source',
        default='standard_price',
        help="Which cost field to use when checking below-cost sales.",
    )
    below_cost_approver_ids = fields.Many2many(
        'res.users',
        string="Authorized Approvers",
        compute='_compute_below_cost_approver_ids',
        inverse='_inverse_below_cost_approver_ids',
        help="Users authorized to approve below-cost sales. "
             "These users must belong to the 'Below Cost Sale Approver' group.",
    )
    notify_approvers_on_flag = fields.Boolean(
        string="Email Approvers When Flagged",
        config_parameter='sale_cost_protection.notify_approvers_on_flag',
        default=False,
        help="Send email notification to approvers when a sale order "
             "is flagged for below-cost items.",
    )
    block_below_cost_completely = fields.Boolean(
        string="Block Below Cost Entry",
        config_parameter='sale_cost_protection.block_below_cost_completely',
        default=False,
        help="If enabled, users cannot even enter a price below cost on "
             "sale order lines (hard block). If disabled, they can enter "
             "the price but the order requires approval before confirmation.",
    )

    @api.depends('enable_below_cost_protection')
    def _compute_below_cost_approver_ids(self):
        approver_group = self.env.ref(
            'sale_cost_protection.group_sale_cost_approver',
            raise_if_not_found=False,
        )
        for record in self:
            if approver_group:
                # Odoo 19: groups_id removed, use direct SQL to get group members
                self.env.cr.execute("""
                    SELECT uid FROM res_groups_users_rel
                    WHERE gid = %s
                """, (approver_group.id,))
                user_ids = [row[0] for row in self.env.cr.fetchall()]
                record.below_cost_approver_ids = self.env['res.users'].browse(user_ids)
            else:
                record.below_cost_approver_ids = self.env['res.users']

    def _inverse_below_cost_approver_ids(self):
        approver_group = self.env.ref(
            'sale_cost_protection.group_sale_cost_approver',
            raise_if_not_found=False,
        )
        if approver_group:
            # Get current users in group via SQL
            self.env.cr.execute("""
                SELECT uid FROM res_groups_users_rel
                WHERE gid = %s
            """, (approver_group.id,))
            current_user_ids = {row[0] for row in self.env.cr.fetchall()}
            new_user_ids = set(self.below_cost_approver_ids.ids)

            # Remove users no longer selected
            to_remove = current_user_ids - new_user_ids
            if to_remove:
                self.env.cr.execute("""
                    DELETE FROM res_groups_users_rel
                    WHERE gid = %s AND uid IN %s
                """, (approver_group.id, tuple(to_remove)))

            # Add newly selected users
            to_add = new_user_ids - current_user_ids
            for uid in to_add:
                self.env.cr.execute("""
                    INSERT INTO res_groups_users_rel (gid, uid)
                    VALUES (%s, %s)
                    ON CONFLICT DO NOTHING
                """, (approver_group.id, uid))

            # Invalidate cache
            self.env['res.users'].invalidate_model()
            self.env['res.groups'].invalidate_model()
